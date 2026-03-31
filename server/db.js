import mongoose from 'mongoose';

const connectDB = async () => {
  const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/camscannerx';

  try {
    const conn = await mongoose.connect(MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📦 Database: ${conn.connection.name}`);
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    console.log('\n💡 Tip: Make sure MongoDB is running or set MONGODB_URI in .env');
    console.log('   For MongoDB Atlas: MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/camscannerx');
    process.exit(1);
  }
};

export default connectDB;
