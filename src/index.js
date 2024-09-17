import dotenv from "dotenv"
dotenv.config({ path: "./.env"})
import connectDB from "./db/index.js";
import { app } from "./app.js";

// const app = express()


const PORT = process.env.PORT || 4100

connectDB()
.then(() => {

    app.on("error", (error) => {
        console.log("Error: ", error)
        throw error
    })
    app.listen(PORT, () => {
        console.log(`Server is running at port ${PORT}`)
    })
})
.catch((err) => {
    console.log("MongoDB connection failed!: ",err)
})