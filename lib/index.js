"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fields = ['username', 'email', 'contact', 'displayName', 'twoFactors', 'gender', 'password', 'disable', 'deactivated', 'suspended', 'lockedUntilTime', 'successTime', 'failTime', 'failCount', 'passwordModifiedTime', 'maxPasswordAge', 'roles', 'userType', 'privileges', 'accessDateFrom', 'accessDateTo', 'accessTimeFrom', 'accessTimeTo', 'language', 'dateFormat', 'timeFormat', 'imageURL'];
function buildProject(fs, mp) {
  if (!fs || fs.length === 0) {
    return undefined;
  }
  var p = {};
  if (mp) {
    for (var _i = 0, fields_1 = fields; _i < fields_1.length; _i++) {
      var s = fields_1[_i];
      var s2 = mp[s];
      if (s2) {
        p[s2] = 1;
      }
      else {
        p[s] = 1;
      }
    }
  }
  else {
    for (var _a = 0, fs_1 = fs; _a < fs_1.length; _a++) {
      var s = fs_1[_a];
      p[s] = 1;
    }
  }
  p['_id'] = 1;
  return p;
}
exports.buildProject = buildProject;
var MongoUserRepository = (function () {
  function MongoUserRepository(db, conf, status, mp) {
    this.db = db;
    this.conf = conf;
    this.status = status;
    this.userCollection = db.collection(this.conf.user);
    this.passwordCollection = db.collection(this.conf.password ? this.conf.password : this.conf.user);
    this.map = mp;
    this.fields = buildProject(fields, mp);
    this.getUser = this.getUser.bind(this);
    this.pass = this.pass.bind(this);
    this.fail = this.fail.bind(this);
  }
  MongoUserRepository.prototype.getUser = function (username) {
    var _a;
    var _this = this;
    var filter = (_a = {}, _a[this.conf.username] = username, _a);
    return this.userCollection.findOne(filter, { projection: this.fields }).then(function (v) {
      if (!v) {
        return v;
      }
      var c = _this.conf;
      v.id = v['_id'];
      delete v['_id'];
      if (c.user === c.password || c.password === undefined) {
        return getUser(map(v, _this.map), c.status, _this.status, c.maxPasswordAge);
      }
      else {
        return _this.passwordCollection.findOne({ _id: v.id }, { projection: _this.fields }).then(function (p) {
          if (!p) {
            return v;
          }
          else {
            delete p['_id'];
            return getUser(map(merge(v, p), _this.map), c.status, _this.status, c.maxPasswordAge);
          }
        });
      }
    });
  };
  MongoUserRepository.prototype.pass = function (userId, deactivated) {
    var _this = this;
    var c = this.conf;
    var pass = {};
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
    var keys = Object.keys(pass);
    if (keys.length === 0) {
      return Promise.resolve(true);
    }
    pass['_id'] = userId;
    if (!deactivated || !this.status || c.status.length === 0) {
      return update(this.passwordCollection, pass);
    }
    else {
      var activated_1 = this.status.activated;
      if (activated_1 && activated_1 !== '') {
        if (c.user === c.password || c.password === undefined) {
          pass[c.status] = activated_1;
          return update(this.passwordCollection, pass);
        }
        else {
          return update(this.passwordCollection, pass).then(function (ok) {
            if (ok) {
              var u = { _id: userId };
              u[c.status] = activated_1;
              return update(_this.userCollection, u);
            }
            else {
              return false;
            }
          });
        }
      }
      else {
        return update(this.passwordCollection, pass);
      }
    }
  };
  MongoUserRepository.prototype.fail = function (userId, failCount, lockedUntilTime) {
    var c = this.conf;
    var pass = {};
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
    var keys = Object.keys(pass);
    if (keys.length === 0) {
      return Promise.resolve(true);
    }
    pass['_id'] = userId;
    return update(this.passwordCollection, pass);
  };
  return MongoUserRepository;
}());
exports.MongoUserRepository = MongoUserRepository;
exports.MongoUserService = MongoUserRepository;
function update(collection, obj) {
  return new Promise((function (resolve, reject) {
    collection.findOneAndUpdate({ _id: obj['_id'] }, { $set: obj }, {
      upsert: true
    }, function (err, result) {
      if (err) {
        reject(err);
      }
      else {
        var c = getAffectedRow(result);
        resolve(c > 0);
      }
    });
  }));
}
exports.update = update;
function getAffectedRow(result) {
  if (result.lastErrorObject) {
    return result.lastErrorObject.n;
  }
  else {
    return (result.ok ? result.ok : 0);
  }
}
exports.getAffectedRow = getAffectedRow;
function getUser(obj, status, s, maxPasswordAge) {
  if (status && status.length > 0) {
    var t = obj[status];
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
    delete obj[status];
  }
  if (maxPasswordAge !== undefined && maxPasswordAge > 0 && (!obj.maxPasswordAge || obj.maxPasswordAge < 0)) {
    obj.maxPasswordAge = maxPasswordAge;
  }
  return obj;
}
exports.getUser = getUser;
function map(obj, m) {
  if (!m) {
    return obj;
  }
  var mkeys = Object.keys(m);
  if (mkeys.length === 0) {
    return obj;
  }
  var obj2 = {};
  var keys = Object.keys(obj);
  for (var _i = 0, keys_1 = keys; _i < keys_1.length; _i++) {
    var key = keys_1[_i];
    var k0 = m[key];
    if (!k0) {
      k0 = key;
    }
    obj2[k0] = obj[key];
  }
  return obj2;
}
exports.map = map;
function merge(obj, p) {
  var keys = Object.keys(p);
  for (var _i = 0, keys_2 = keys; _i < keys_2.length; _i++) {
    var key = keys_2[_i];
    obj[key] = p[key];
  }
  return obj;
}
exports.merge = merge;
