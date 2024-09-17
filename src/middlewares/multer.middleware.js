import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename);


        
const storage = multer.diskStorage({
    destination: function(req, file, cb){
        const tempDir = path.join(__dirname, "../../public/temp")

        // Ensure the temp directory exists
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        cb(null, tempDir)
    },
    filename: function(req, file, cb){
        cb(null, file.originalname)
    }
})

export const upload = multer({ 
    storage, 
})