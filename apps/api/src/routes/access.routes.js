const express = require("express");
const {
  selectPlan,
  getAccessState,
  getMyTeam,
  lookupTeamInvite,
  addTeamMember,
  acceptTeamInvite,
  declineTeamInvite,
  resendTeamInvite,
  removeTeamMember,
} = require("../controllers/access.controller");
const { authMiddleware, requireUser } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/team/invites/lookup", lookupTeamInvite);

router.use(authMiddleware);

router.post("/team/invites/accept", acceptTeamInvite);
router.post("/team/invites/decline", declineTeamInvite);

router.use(requireUser);

router.get("/me", getAccessState);
router.post("/select", selectPlan);
router.get("/team", getMyTeam);
router.post("/team/members", addTeamMember);
router.post("/team/invites/:inviteId/resend", resendTeamInvite);
router.delete("/team/members/:userId", removeTeamMember);

module.exports = router;
