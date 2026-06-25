const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Connects to the User who posted it
    authorName: { type: String },
    authorPic: { type: String },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Post', postSchema);