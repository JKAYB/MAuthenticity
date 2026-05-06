const express = require("express");
const {
  getTeamDetails,
  updateTeamMemberRole,
  transferTeamOwnership,
} = require("../controllers/access.controller");
const { authMiddleware, requireUser } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(authMiddleware);
router.use(requireUser);
router.get("/", getTeamDetails);
router.patch("/members/:memberId/role", updateTeamMemberRole);
router.post("/transfer-ownership", transferTeamOwnership);

module.exports = router;
