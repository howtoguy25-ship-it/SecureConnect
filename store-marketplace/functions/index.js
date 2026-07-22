const { initializeApp } = require("firebase-admin/app");

initializeApp();

exports.verifyBusiness = require("./verifyBusiness").verifyBusiness;
exports.aiDraftStoreProfile = require("./aiDraftStoreProfile").aiDraftStoreProfile;
exports.sendBusinessNotification = require("./sendBusinessNotification").sendBusinessNotification;
exports.onStockChange = require("./onStockChange").onStockChange;
exports.inviteTeamMemberByEmail = require("./inviteTeamMemberByEmail").inviteTeamMemberByEmail;
