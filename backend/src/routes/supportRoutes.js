const express = require("express");

const {
  createDoctorSupportTicket,
  listDoctorSupportTickets,
  markDoctorSupportTicketsRead,
  listAdminSupportTickets,
  updateSupportTicketStatus,
  replyToSupportTicket,
  markAdminSupportTicketsRead,
  deleteSupportTicket,
  deleteSupportTickets,
  deleteSupportTicketMessage,
  deleteSupportTicketMessages,
} = require("../controllers/supportController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { supportUpload } = require("../middleware/uploadMiddleware");

const router = express.Router();

router.post("/tickets", protect, authorize("doctor"), supportUpload.single("attachment"), createDoctorSupportTicket);
router.get("/tickets/mine", protect, authorize("doctor"), listDoctorSupportTickets);
router.patch("/tickets/mine/read", protect, authorize("doctor"), markDoctorSupportTicketsRead);

router.get("/admin/tickets", protect, authorize("admin"), listAdminSupportTickets);
router.patch("/admin/tickets/read", protect, authorize("admin"), markAdminSupportTicketsRead);
router.patch("/admin/tickets/:id/status", protect, authorize("admin"), updateSupportTicketStatus);
router.post(
  "/tickets/:id/reply",
  protect,
  authorize("doctor", "admin"),
  supportUpload.single("attachment"),
  replyToSupportTicket
);
router.delete("/tickets", protect, authorize("doctor", "admin"), deleteSupportTickets);
router.delete("/tickets/:id", protect, authorize("doctor", "admin"), deleteSupportTicket);
router.delete("/tickets/:id/messages", protect, authorize("doctor", "admin"), deleteSupportTicketMessages);
router.delete("/tickets/:id/messages/:messageId", protect, authorize("doctor", "admin"), deleteSupportTicketMessage);

module.exports = router;
