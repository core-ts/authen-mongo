import { Collection, Db } from 'mongodb';

export interface StringMap {
  [key: string]: string;
}
export interface UserInfo {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  gender?: string;
  password?: string;
  disable?: boolean;
  deactivated?: boolean;
  suspended?: boolean;
  lockedUntilTime?: Date;
  successTime?: Date;
  failTime?: Date;
  failCount?: number;
  passwordModifiedTime?: Date;
  maxPasswordAge?: number;
  roles?: string[];

  userType?: string;
  privileges?: string[];
  accessDateFrom?: Date;
  accessDateTo?: Date;
  accessTimeFrom?: Date;
  accessTimeTo?: Date;

  language?: string;
  dateFormat?: string;
  timeFormat?: string;
  imageURL?: string;
}
export interface UserRepository {
  getUser(username: string): Promise<UserInfo|null|undefined>;
  pass?(userId: string, deactivated?: boolean): Promise<boolean>;
  fail?(userId: string, failCount?: number, lockedUntilTime?: Date|null): Promise<boolean>;
}
export interface DBConfig {
  status: string; // status field name
  maxPasswordAge?: number;
  user: string;
  password?: string;
  username: string;
  successTime: string;
  failTime: string;
  failCount: string;
  lockedUntilTime: string;
}
export interface UserStatus {
  activated?: number | string;
  deactivated?: number | string;
  disable?: number | string;
  suspended?: number | string;
}
const fields = ['username', 'email', 'displayName', 'gender', 'password', 'disable', 'deactivated', 'suspended', 'lockedUntilTime', 'successTime', 'failTime', 'failCount', 'passwordModifiedTime', 'maxPasswordAge', 'roles', 'userType', 'privileges', 'accessDateFrom', 'accessDateTo', 'accessTimeFrom', 'accessTimeTo', 'language', 'dateFormat', 'timeFormat', 'imageURL'];
export function buildProject(fs: string[], mp?: StringMap): any {
  if (!fs || fs.length === 0) {
    return undefined;
  }
  const p: any = {};
  if (mp) {
    for (const s of fields) {
      const s2 = mp[s];
      if (s2) {
        p[s2] = 1;
      } else {
        p[s] = 1;
      }
    }
  } else {
    for (const s of fs) {
      p[s] = 1;
    }
  }
  p['_id'] = 1;
  return p;
}
export class MongoUserRepository implements UserRepository {
  constructor(public db: Db, public conf: DBConfig, public status?: UserStatus, mp?: StringMap) {
    this.userCollection = db.collection(this.conf.user);
    this.passwordCollection = db.collection(this.conf.password ? this.conf.password : this.conf.user);
    this.map = mp;
    this.fields = buildProject(fields, mp);
    this.getUser = this.getUser.bind(this);
    this.pass = this.pass.bind(this);
    this.fail = this.fail.bind(this);
  }
  fields: any;
  userCollection: Collection;
  passwordCollection: Collection;
  map?: StringMap;
  getUser(username: string): Promise<UserInfo | null | undefined> {
    const filter = {[this.conf.username]: username};
    return this.userCollection.findOne<UserInfo>(filter, { projection: this.fields }).then(v => {
      if (!v) {
        return v;
      }
      const c = this.conf;
      v.id = (v as any)['_id'];
      delete (v as any)['_id'];
      if (c.user === c.password || c.password === undefined) {
        return getUser(map(v, this.map), c.status, this.status, c.maxPasswordAge);
      } else {
        return this.passwordCollection.findOne<UserInfo>({_id: v.id}, { projection: this.fields }).then(p => {
          if (!p) {
            return v;
          } else {
            delete (p as any)['_id'];
            return getUser(map(merge(v, p), this.map), c.status, this.status, c.maxPasswordAge);
          }
        });
      }
    });
  }
  pass(userId: string, deactivated?: boolean): Promise<boolean> {
    const c = this.conf;
    const pass: any = {};
    if (c.successTime.length > 0) {
      pass[c.successTime] = new Date();
    }
    if (c.failTime.length > 0) {
      pass[c.failTime] = null;
    }
    if (c.failCount.length > 0) {
      pass[c.failCount] = 0;
    }
    if (c.lockedUntilTime.length > 0) {
      pass[c.lockedUntilTime] = null;
    }
    const keys = Object.keys(pass);
    if (keys.length === 0) {
      return Promise.resolve(true);
    }
    pass['_id'] = userId;
    if (!deactivated || !this.status || c.status.length === 0) {
      return update(this.passwordCollection, pass);
    } else {
      const activated = this.status.activated;
      if (activated && activated !== '') {
        if (c.user === c.password || c.password === undefined) {
          pass[c.status] = activated;
          return update(this.passwordCollection, pass);
        } else {
          return update(this.passwordCollection, pass).then(ok => {
            if (ok) {
              const u: any = { _id: userId };
              u[c.status] = activated;
              return update(this.userCollection, u);
            } else {
              return false;
            }
          });
        }
      } else {
        return update(this.passwordCollection, pass);
      }
    }
  }
  fail(userId: string, failCount?: number, lockedUntilTime?: Date|null): Promise<boolean> {
    const c = this.conf;
    const pass: any = {};
    if (c.failTime.length > 0) {
      pass[c.failTime] = new Date();
    }
    if (c.failTime.length > 0) {
      pass[c.failCount] = new Date();
    }
    if (c.failCount.length > 0 && failCount !== undefined) {
      pass[c.failCount] = failCount + 1;
    }
    if (lockedUntilTime !== undefined && c.lockedUntilTime.length > 0) {
      pass[c.lockedUntilTime] = lockedUntilTime;
    }
    const keys = Object.keys(pass);
    if (keys.length === 0) {
      return Promise.resolve(true);
    }
    pass['_id'] = userId;
    return update(this.passwordCollection, pass);
  }
}
export const MongoUserService = MongoUserRepository;
export function update<T>(collection: Collection, obj: T): Promise<boolean> {
  return new Promise<boolean>(((resolve, reject) => {
    collection.findOneAndUpdate({ _id: (obj as any)['_id'] }, { $set: obj }, {
      upsert: true
    }, (err: any, result: any) => {
      if (err) {
        reject(err);
      } else {
        const c = getAffectedRow(result);
        resolve(c > 0);
      }
    });
  }));
}
export function getAffectedRow(result: any): number {
  if (result.lastErrorObject) {
    return result.lastErrorObject.n;
  } else {
    return (result.ok ? result.ok : 0);
  }
}
export function getUser(obj: UserInfo, status?: string, s?: UserStatus, maxPasswordAge?: number): UserInfo {
  if (status && status.length > 0) {
    const t = (obj as any)[status];
    if (t !== undefined && t != null && s) {
      if (s.deactivated !== undefined && t === s.deactivated) {
        obj.deactivated = true;
      }
      if (s.suspended !== undefined && t === s.suspended) {
        obj.suspended = true;
      }
      if (s.disable !== undefined && t === s.disable) {
        obj.disable = true;
      }
    }
    delete (obj as any)[status];
  }
  if (maxPasswordAge !== undefined && maxPasswordAge > 0 && (!obj.maxPasswordAge || obj.maxPasswordAge < 0)) {
    obj.maxPasswordAge = maxPasswordAge;
  }
  return obj;
}
export function map<T>(obj: T, m?: StringMap): T {
  if (!m) {
    return obj;
  }
  const mkeys = Object.keys(m);
  if (mkeys.length === 0) {
    return obj;
  }
  const obj2: any = {};
  const keys = Object.keys(obj);
  for (const key of keys) {
    let k0 = m[key];
    if (!k0) {
      k0 = key;
    }
    obj2[k0] = (obj as any)[key];
  }
  return obj2;
}
export function merge<T>(obj: T, p: any): T {
  const keys = Object.keys(p);
  for (const key of keys) {
    (obj as any)[key] = p[key];
  }
  return obj;
}
