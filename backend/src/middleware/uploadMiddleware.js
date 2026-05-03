const fs = require("fs");
const path = require("path");
const multer = require("multer");

const uploadRootDir = path.join(__dirname, "..", "..", "uploads");

if (!fs.existsSync(uploadRootDir)) {
  fs.mkdirSync(uploadRootDir, { recursive: true });
}

const doctorDocumentMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const supportMessageMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "audio/mpeg",
]);

const ensureUploadDirectory = (directoryPath) => {
  if (!fs.existsSync(directoryPath)) {
    fs.mkdirSync(directoryPath, { recursive: true });
  }
};

const createUpload = ({
  subdirectory,
  allowedMimeTypes,
  maxFileSize,
  errorMessage,
}) => {
  const destinationDir = path.join(uploadRootDir, subdirectory);
  ensureUploadDirectory(destinationDir);

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, destinationDir);
    },
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/\s+/g, "-").replace(/[^\w.-]/g, "");
      cb(null, `${Date.now()}-${safeName}`);
    },
  });

  const fileFilter = (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      cb(new Error(errorMessage));
      return;
    }

    cb(null, true);
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxFileSize,
    },
  });
};

const upload = createUpload({
  subdirectory: "",
  allowedMimeTypes: doctorDocumentMimeTypes,
  maxFileSize: 5 * 1024 * 1024,
  errorMessage: "Only PDF, PNG, JPG, and WEBP files are allowed",
});

const supportUpload = createUpload({
  subdirectory: "support-files",
  allowedMimeTypes: supportMessageMimeTypes,
  maxFileSize: 10 * 1024 * 1024,
  errorMessage:
    "Supported files are PDF, images, text, Office documents, ZIP archives, and MP3 audio up to 10 MB",
});

module.exports = {
  upload,
  supportUpload,
};
