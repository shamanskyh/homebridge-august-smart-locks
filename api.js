var AugustApi = function AugustApi(config) {
    process.env.AUGUST_API_KEY = config.securityToken || "7cab4bbd-2693-4fc1-b99b-dec0fb20f9d4"; //pulled from android apk july 2020
    process.env.AUGUST_INSTALLID = config.installId;
    process.env.AUGUST_PASSWORD = config.password;
    process.env.AUGUST_ID_TYPE = 'email';
    process.env.AUGUST_ID = config.email;
    return require('august-connect');
}
module.exports = AugustApi;
