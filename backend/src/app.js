const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const predictionRoutes = require("./routes/predictionRoutes");
const supportRoutes = require("./routes/supportRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();
const frontendRoot = path.join(__dirname, "..", "..", "frontend");

app.use(cors());
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  const requestExtension = path.extname(req.path).toLowerCase();
  if (!requestExtension || [".html", ".css", ".js"].includes(requestExtension)) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
app.use(express.static(frontendRoot));

app.use("/api/auth", authRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/support", supportRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;