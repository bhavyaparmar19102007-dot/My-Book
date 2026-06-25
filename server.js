require('dotenv').config(); // <-- Add this as the absolute first line
const session = require('express-session');
const Post = require('./models/Post');
const nodemailer = require('nodemailer');
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const path = require('path');
const User = require('./models/User');

const app = express();

// Middleware to parse form data and JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use(session({
    secret: process.env.SESSION_SECRET, 
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } 
}));

// Serve static files (your HTML/CSS and the uploaded photos)
app.use(express.static('public')); 
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mybookDB';

mongoose.connect(mongoUri)
  .then(() => console.log(`Connected to MongoDB at ${mongoUri}`))
  .catch(err => {
    console.error(`Could not connect to MongoDB at ${mongoUri}`);
    console.error(err);
    process.exit(1);
  });

// --- MULTER CONFIGURATION FOR PHOTO UPLOADS ---

// --- MULTER CONFIGURATION FOR PHOTO UPLOADS ---

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Save photos to the 'uploads' folder
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Rename to avoid duplicates
    }
});

const upload = multer({ storage: storage });

// --- ROUTES ---

// 1. Sign Up Endpoint
app.post('/signup', async (req, res) => {
    try {
        const { firstName, lastName, gender, email, password } = req.body;
        
        // Hash the password for security
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            firstName,
            lastName,
            gender,
            email,
            password: hashedPassword
        });

        await newUser.save();
        res.send("Account created successfully! <a href='/login.html'>Go to Login</a>");
    } catch (error) {
        res.status(400).send("Error creating account: " + error.message);
    }
});

// 2. Login Endpoint
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (user && await bcrypt.compare(password, user.password)) {
            // Save the user's ID in the session memory!
            req.session.userId = user._id; 
            // Send them to the news feed
            res.redirect('/feed.html'); 
        } else {
            res.status(401).send("Invalid email or password.");
        }
    } catch (error) {
        res.status(500).send("Server error");
    }
});

// --- EMAIL CONFIGURATION ---
// You will need to put your real email and an "App Password" here
// --- EMAIL CONFIGURATION ---
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS  
    }
});

// 4. Request Password Reset Endpoint
app.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.send("If that email exists, a code has been sent."); // Security best practice
        }

        // Generate a random 6-digit code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Save code to database, valid for 15 minutes
        user.resetCode = code;
        user.resetCodeExpiration = Date.now() + 15 * 60 * 1000; 
        await user.save();

        // Send the email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'MyBook Password Reset Code',
            text: `Your password reset code is: ${code}. It expires in 15 minutes.`
        };

        await transporter.sendMail(mailOptions);
        
        // Send them to the page to type in the code
        res.redirect('/verify-code.html');

    } catch (error) {
        console.error(error);
        res.status(500).send("Error processing request.");
    }
});

// 5. Reset Password Endpoint
app.post('/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        const user = await User.findOne({ email });

        // Check if user exists, code matches, and code is not expired
        if (!user || user.resetCode !== code || user.resetCodeExpiration < Date.now()) {
            return res.status(400).send("Invalid or expired verification code.");
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user, clear the temporary codes
        user.password = hashedPassword;
        user.resetCode = null;
        user.resetCodeExpiration = null;
        await user.save();

        res.send("Password successfully changed! <br><br> <a href='/login.html'>Go to Login</a>");

    } catch (error) {
        res.status(500).send("Error resetting password.");
    }
});

// 3. Upload Profile Photo & Update Bio
app.post('/profile/update', upload.single('profilePic'), async (req, res) => {
    try {
        const { email, bio } = req.body;
        const updateData = { bio: bio };

        // If a file was uploaded, add it to the update object
        if (req.file) {
            updateData.profilePic = req.file.path;
        }

        await User.findOneAndUpdate({ email: email }, updateData);
        res.send("Profile updated successfully!");
    } catch (error) {
        res.status(500).send("Error updating profile.");
    }
});

// --- ROOT ROUTE ---
// Redirect users to the login page when they visit the base URL
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Route to get the currently logged-in user's data (for the top right pic)
app.get('/api/current-user', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
    
    const user = await User.findById(req.session.userId);
    res.json(user);
});

// Route to create a new post
app.post('/create-post', async (req, res) => {
    if (!req.session.userId) return res.redirect('/login.html');
    
    const user = await User.findById(req.session.userId);
    const newPost = new Post({
        userId: user._id,
        authorName: `${user.firstName} ${user.lastName}`,
        authorPic: user.profilePic,
        content: req.body.content
    });

    await newPost.save();
    res.redirect('/feed.html'); // Refresh the feed
});

// Route to get all posts for the feed
app.get('/api/posts', async (req, res) => {
    // Get all posts, sorted newest to oldest
    const posts = await Post.find().sort({ createdAt: -1 }); 
    res.json(posts);
});

// --- NEW PROFILE & LOGOUT ROUTES ---

// 1. Logout Endpoint: Destroys the session
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).send("Could not log out.");
        res.redirect('/login.html'); // Send them back to the login screen
    });
});

// 2. Fetch only the logged-in user's posts
app.get('/api/my-posts', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Not logged in" });
    
    // Find posts where the userId matches the currently logged-in user
    const myPosts = await Post.find({ userId: req.session.userId }).sort({ createdAt: -1 });
    res.json(myPosts);
});

// --- NEW DYNAMIC PROFILE ROUTES ---

// 1. Get public info of ANY user by their ID (excludes password)
app.get('/api/user/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// 2. Get posts of ANY user by their ID
app.get('/api/posts/user/:id', async (req, res) => {
    try {
        const userPosts = await Post.find({ userId: req.params.id }).sort({ createdAt: -1 });
        res.json(userPosts);
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
