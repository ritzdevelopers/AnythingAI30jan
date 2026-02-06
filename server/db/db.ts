import mongoose from "mongoose";

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI: string | undefined = process.env.MONGO_DB_URI;

    if (!mongoURI) {
      throw new Error("MONGO_DB_URI is not defined in environment variables");
    }

    await mongoose.connect(mongoURI);

    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

export default connectDB;
