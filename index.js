const AugustApi = require('./api.js');
var chalk = require("chalk");

var Accessory, Service, Characteristic, UUIDGen;

module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform("AugustLock2", AugustPlatform);

}

function AugustPlatform(log, config, api) {
  this.log = log;
  this.platformLog = function (msg) { log(chalk.cyan("[August]"), msg); };
  this.config = config || { "platform": "AugustLock2" };
  this.email = this.config.email;
  this.phone = this.config.phone;
  this.password = this.config.password;
  this.securityToken = this.config.securityToken;;
  this.code = this.config.code;
  this.installId = this.config.installId;
  this.longPoll = parseInt(this.config.longPoll, 10) || 180;
  this.shortPoll = parseInt(this.config.shortPoll, 10) || 15;
  this.shortPollDuration = parseInt(this.config.shortPollDuration, 10) || 300;
  this.tout = null;
  this.updating = false;
  this.maxCount = this.shortPollDuration / this.shortPoll;
  this.count = this.maxCount;
  this.validData = false;

  this.augustApi = new AugustApi(this.config);

  this.manufacturer = "AUGUST";
  this.accessories = {};

  if (api) {
    this.api = api;
    this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));

  }

  // Definition Mapping
  this.lockState = ["unlock", "lock"];

}

// Method to setup accesories from config.json
AugustPlatform.prototype.didFinishLaunching = function () {

  if (this.email && this.phone && this.password) {
    // Add or update accessory in HomeKit
    this.addAccessory();
    this.periodicUpdate();

  } else {
    this.platformLog("Please setup August login information!")

  }

}

// Method to add or update HomeKit accessories
AugustPlatform.prototype.addAccessory = function () {
  var self = this;

  this.login(function (error) {
    if (!error) {
      for (var deviceID in self.accessories) {
        var accessory = self.accessories[deviceID];
        if (!accessory.reachable) {
          // Remove extra accessories in cache
          self.removeAccessory(accessory);

        } else {
          // Update inital state
          self.updatelockStates(accessory);

        }

      }

    }

  });
}

// Method to remove accessories from HomeKit
AugustPlatform.prototype.removeAccessory = function (accessory) {

  if (accessory) {
    var deviceID = accessory.context.deviceID;
    accessory.context.log("Removed from HomeBridge.");
    this.api.unregisterPlatformAccessories("homebridge-AugustLock2", "AugustLock2", [accessory]);
    delete this.accessories[deviceID];

  }
}

// Method to restore accessories from cache
AugustPlatform.prototype.configureAccessory = function (accessory) {
  var self = this;
  var accessoryID = accessory.context.deviceID;

  accessory.context.log = function (msg) { self.log(chalk.cyan("[" + accessory.displayName + "]"), msg); };
  this.setService(accessory);
  this.accessories[accessoryID] = accessory;

}

// Method to setup listeners for different events
AugustPlatform.prototype.setService = function (accessory) {
  accessory
    .getService(Service.LockMechanism)
    .getCharacteristic(Characteristic.LockCurrentState)
    .on('get', this.getState.bind(this, accessory));

  accessory
    .getService(Service.LockMechanism)
    .getCharacteristic(Characteristic.LockTargetState)
    .on('get', this.getState.bind(this, accessory))
    .on('set', this.setState.bind(this, accessory));

  accessory
    .getService(Service.BatteryService)
    .getCharacteristic(Characteristic.BatteryLevel);

  accessory
    .getService(Service.BatteryService)
    .getCharacteristic(Characteristic.StatusLowBattery);

  accessory.on('identify', this.identify.bind(this, accessory));

}

// Method to setup HomeKit accessory information
AugustPlatform.prototype.setAccessoryInfo = function (accessory) {
  if (this.manufacturer) {
    accessory
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer);

  }

  if (accessory.context.serialNumber) {
    accessory
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.SerialNumber, accessory.context.serialNumber);

  }

  if (accessory.context.model) {
    accessory
      .getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Model, accessory.context.model);

  }

}

// Method to set target lock state
AugustPlatform.prototype.setState = function (accessory, state, callback) {
  var self = this;

  // Always re-login for setting the state
  this.getDevice(function (getlocksError) {
    if (!getlocksError) {
      self.setState(accessory, state, function (setStateError) {
        callback(setStateError);
      });

    } else {
      callback(getlocksError);

    }

  }, accessory.context.deviceID);

}

// Method to get target lock state
AugustPlatform.prototype.getState = function (accessory, callback) {
  // Get target state directly from cache
  callback(null, accessory.context.currentState);

}

// Method for state periodic update
AugustPlatform.prototype.periodicUpdate = function () {
  var self = this;

  // Determine polling interval
  if (this.count < this.maxCount) {
    this.count++;
    var refresh = this.shortPoll;

  } else {
    var refresh = this.longPoll;

  }

  // Setup periodic update with polling interval
  this.tout = setTimeout(function () {
    self.tout = null
    self.updateState(function (error, skipped) {
      if (!error) {
        if (!skipped) {
          // Update states for all HomeKit accessories
          for (var deviceID in self.accessories) {
            var accessory = self.accessories[deviceID];
            self.updatelockStates(accessory);

          }
        }

      } else {
        // Re-login after short polling interval if error occurs
        self.count = self.maxCount - 1;

      }

      // Setup next polling
      if (!skipped) {
        self.updating = false;
        self.periodicUpdate();

      }
    });

  }, refresh * 1000);
}

// Method to update lock state in HomeKit
AugustPlatform.prototype.updatelockStates = function (accessory) {
  accessory
    .getService(Service.LockMechanism)
    .setCharacteristic(Characteristic.LockCurrentState, accessory.context.currentState);

  accessory
    .getService(Service.LockMechanism)
    .getCharacteristic(Characteristic.LockTargetState)
    .getValue();

  accessory
    .getService(Service.BatteryService)
    .setCharacteristic(Characteristic.BatteryLevel, accessory.context.batt);

  accessory
    .getService(Service.BatteryService)
    .getCharacteristic(Characteristic.StatusLowBattery, accessory.context.low);

}

// Method to retrieve lock state from the server
AugustPlatform.prototype.updateState = function (callback) {
  if (this.updating) {
    this.log("updateState called while previous still active");
    callback(null, true);
    return;

  }

  this.log.debug("updateState called");
  this.updating = true;

  if (this.validData) {
    // Refresh data directly from sever if current data is valid
    this.getlocks(function (error) {
      callback(error, false);

    });

  } else {
    // Re-login if current data is not valid
    this.login(function (error) {
      callback(error, false);

    });

  }

}

// Method to handle identify request
AugustPlatform.prototype.identify = function (accessory, paired, callback) {
  accessory.context.log("Identify requested!");
  callback();

}

// loging auth and get token
AugustPlatform.prototype.login = function (callback) {
  var self = this;

  // Log in
  var authenticate = this.augustApi.authorize();
  authenticate.then(function (result) {
    self.postLogin(callback);
  }, function (error) {
    var authenticate = this.augustApi.authorize(this.code);
    authenticate.then(function (result) {
      self.postLogin(callback);
    }, function (error) {
      self.platformLog(error);
      callback(error, null);

    });

  });

}

AugustPlatform.prototype.postLogin = function (callback) {
  var self = this;
    self.getlocks(callback);

}

AugustPlatform.prototype.getlocks = function (callback) {
  var self = this;

  // get locks
  this.platformLog("getting locks ...");
  var getLocks = this.augustApi.locks();
  getLocks.then(function (json) {
    self.lockids = Object.keys(json);
    for (var i = 0; i < self.lockids.length; i++) {
      self.lock = json[self.lockids[i]];
      self.lockname = self.lock["LockName"];
      self.platformLog(self.lock["HouseName"] + " " + self.lockname);
      self.lockId = self.lockids[i];
      self.platformLog("LockId " + " " + self.lockId);
      self.getDevice(callback, self.lockId, self.lockname, self.lock["HouseName"]);

    }

  }, function (error) {
    self.platformLog(error);
    callback(error, null);

  });

}

AugustPlatform.prototype.getDevice = function (callback, lockId, lockName, houseName) {
  var self = this;

  this.validData = false;

  var getLock = self.augustApi.status(lockId);
  getLock.then(function (lock) {
    var locks = lock.info //JSON.parse(JSON.stringify(lock));

    // self.platformLog(lock);
    if (!locks.BridgeID) {
      self.validData = true;
      return;

    }
    var thisDeviceID = locks.LockID.toString();
    var thisSerialNumber = locks.SerialNumber.toString();
    var thisModel = locks.lockType.toString();
    var thislockName = lockName;
    var state = (lock.status == "kAugLockState_Locked") ? "locked" : (lock.status == "kAugLockState_Unlocked") ? "unlocked" : "error";
    var nameFound = true;
    var stateFound = true;
    var thishome = houseName;
    // battery no longer provided over api calls
    self.batt = 100;

    var locked = state == "locked";
    var unlocked = state == "unlocked";

    var thislockState = (state == "locked") ? "1" : "0";

    if (self.batt < 20) {
      lowbatt = Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
      var newbatt = Characteristic.LockCurrentState.SECURED;

    } else if (self.batt > 20) {
      lowbatt = Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
      var newbatt = Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;

    }

    // Initialization for opener
    //if (!self.accessories[thisDeviceID]) {
      var uuid = UUIDGen.generate(thisDeviceID);

      // Setup accessory as GARAGE_lock_OPENER (4) category.
      var newAccessory = new Accessory("August " + thishome, uuid, 6);

      // New accessory found in the server is always reachable
      newAccessory.reachable = true;

      // Store and initialize variables into context
      newAccessory.context.deviceID = thisDeviceID;
      newAccessory.context.initialState = Characteristic.LockCurrentState.SECURED;
      newAccessory.context.currentState = Characteristic.LockCurrentState.SECURED;
      newAccessory.context.serialNumber = thisSerialNumber;
      newAccessory.context.home = thishome;
      newAccessory.context.model = thisModel;
     // newAccessory.context.batt = self.batt;
      newAccessory.context.low = self.low;

      newAccessory.context.log = function (msg) { self.log(chalk.cyan("[" + newAccessory.displayName + "]"), msg); };

      // Setup HomeKit security systemLoc service
      newAccessory.addService(Service.LockMechanism, thislockName);
      //newAccessory.addService(Service.BatteryService);
      // Setup HomeKit accessory information
      self.setAccessoryInfo(newAccessory);
      // Setup listeners for different security system events
      self.setService(newAccessory);
      // Register accessory in HomeKit
      self.platformLog("adding lock lock to homebridge");
      self.api.registerPlatformAccessories("homebridge-august-smart-locks", "AugustLock2", [newAccessory]);

//     } else {
//       // Retrieve accessory from cache
//       var newAccessory = self.accessories[thisDeviceID];

//       // Update context
//       newAccessory.context.deviceID = thisDeviceID;
//       newAccessory.context.serialNumber = thisSerialNumber;
//       newAccessory.context.model = thisModel;
//       newAccessory.context.home = thishome;

//       // Accessory is reachable after it's found in the server
//       newAccessory.updateReachability(true);

//     }

    if (self.batt) {
      newAccessory.context.low = (self.batt > 20) ? Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL : Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;

    }

    if (state) {
      if (state === "locked") {
        newAccessory.context.initialState = Characteristic.LockCurrentState.UNSECURED;
        var newState = Characteristic.LockCurrentState.SECURED;

      } else if (state === "unlocked") {
        newAccessory.context.initialState = Characteristic.LockCurrentState.SECURED;
        var newState = Characteristic.LockCurrentState.UNSECURED;

      }

      // Detect for state changes
      if (newState !== newAccessory.context.currentState) {
        self.count = 0;
        newAccessory.context.currentState = newState;

      }

    }

    // Store accessory in cache
    self.accessories[thisDeviceID] = newAccessory;

    // Set validData hint after we found an opener
    self.validData = true;

    // Did we have valid data?
    if (self.validData) {
      // Set short polling interval when state changes
      if (self.tout && self.count == 0) {
        clearTimeout(self.tout);
        self.periodicUpdate();

      }
      callback();

    } else {
      self.platformLog("Error: Couldn't find a August lock device.");
      callback("Missing August Device ID");

    }

  }, function (error) {
    self.platformLog(error);
    callback(error, null);

  });

}

// Send opener target state to the server
AugustPlatform.prototype.setState = function (accessory, state, callback) {
  var self = this;
  var lockCtx = accessory.context;
  var status = this.lockState[state];
  var augustState = (state == Characteristic.LockTargetState.SECURED) ? this.augustApi.lock(lockCtx.deviceID) : this.augustApi.unlock(lockCtx.deviceID);

  var remoteOperate = this.augustApi.lock(lockCtx.deviceID);
  remoteOperate.then(function (result) {
    lockCtx.log("State was successfully set to " + status);

    // Set short polling interval
    self.count = 0;
    if (self.tout) {
      clearTimeout(self.tout);
      self.periodicUpdate();

    }
    callback(null, state);

  }, function (error) {
    lockCtx.log("Error '" + error + "' setting lock state: " + status);
    self.removeAccessory(accessory);
    callback(error);

  });

}
