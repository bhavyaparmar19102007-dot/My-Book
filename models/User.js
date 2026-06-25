const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    gender: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profilePic: { type: String, default: 'default-avatar.png' },
    bio: { type: String, default: '' },
    
    // Password Reset Fields
    resetCode: { type: String, default: null },
    resetCodeExpiration: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);