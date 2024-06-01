const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const { createCanvas } = require('canvas');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// const db = connectToDB();

const app = express();
const PORT = 3000;
const dbFileName = 'blog.db';
let db;
let sortOrder = "most-recent";

// Ensure the database is initialized before starting the server.
initializeDB().then(() => {
    console.log('Database initialized. Server starting...');
    app.listen(PORT, () => {
        console.log('Server running on http://localhost:3000');
    }
    );
}
).catch(err => {
    console.error('Failed to initialize the database:', err);
});

passport.use(new GoogleStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`
}, (token, tokenSecret, profile, done) => {
    return done(null, profile);
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});


/*
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Handlebars Helpers

    Handlebars helpers are custom functions that can be used within the templates 
    to perform specific tasks. They enhance the functionality of templates and 
    help simplify data manipulation directly within the view files.

    In this project, two helpers are provided:
    
    1. toLowerCase:
       - Converts a given string to lowercase.
       - Usage example: {{toLowerCase 'SAMPLE STRING'}} -> 'sample string'

    2. ifCond:
       - Compares two values for equality and returns a block of content based on 
         the comparison result.
       - Usage example: 
            {{#ifCond value1 value2}}
                <!-- Content if value1 equals value2 -->
            {{else}}
                <!-- Content if value1 does not equal value2 -->
            {{/ifCond}}
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
*/

// Set up Handlebars view engine with custom helpers
//
// Set up Handlebars view engine with custom helpers
app.engine(
    'handlebars',
    expressHandlebars.engine({
        helpers: {
            toLowerCase: function (str) {
                return str.toLowerCase();
            },
            ifCond: function (v1, v2, options) {
                if (v1 === v2) {
                    return options.fn(this);
                }
                return options.inverse(this);
            },
            formatDate: function (date) {
                const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true };
                return new Date(date).toLocaleString('en-US', options).replace(',', '');
            }
        }
    })
);


app.set('view engine', 'handlebars');
app.set('views', './views');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Middleware
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.use(
    session({
        secret: 'oneringtorulethemall',     // Secret key to sign the session ID cookie
        resave: false,                      // Don't save session if unmodified
        saveUninitialized: false,           // Don't create session until something stored
        cookie: { secure: false },          // True if using https. Set to false for development without https
    })
);

app.use(passport.initialize());
app.use(passport.session());


// Replace any of these variables below with constants for your application. These variables
// should be used in your template files. 
// 
app.use((req, res, next) => {
    res.locals.appName = 'IBlog';
    res.locals.copyrightYear = 2024;
    res.locals.postNeoType = 'Post';
    res.locals.loggedIn = req.session.loggedIn || false;
    res.locals.userId = req.session.userId || '';
    next();
});

app.use(express.static('public'));                  // Serve static files
app.use(express.urlencoded({ extended: true }));    // Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.json());                            // Parse JSON bodies (as sent by API clients)

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Routes
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Home route: render home view with posts and user
// We pass the posts and user variables into the home
// template
//
app.get('/', (req, res) => {
    // const posts = getPosts();
    // const user = getCurrentUser(req) || {};
    // res.render('home', { posts, user });

    (async function() {
        let posts;
        const user = await getCurrentUser(req) || {};
        // render the posts based on the state of sortOrder
        if (sortOrder === "most-liked") {
            posts = await db.all(`SELECT * FROM posts \
            ORDER BY likes DESC`);
            posts = await processPosts(posts);
        } else if (sortOrder == "most-recent") {
            posts = await getPosts();
        } else {
            res.status(400).send("no such option");
            return;
        }
        res.render('home', { posts, user, sortOrder });
    })();
});

// Register GET route is used for error response from registration
//
app.get('/register', (req, res) => {
    res.render('loginRegister', { regError: req.query.error });
});

// Login route GET route is used for error response from login
//
app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

// Error route: render error page
//
app.get('/error', (req, res) => {
    res.render('error');
});

// Additional routes that you must implement
app.post('/posts', (req, res) => {
    // TODO: Add a new post and redirect to home
    (async function () {
        await addPost(req.body.title, req.body.postBody, await getCurrentUser(req));
        res.redirect("/");
    })();
});
app.post('/like/:id', isAuthenticated, (req, res) => {
    (async function () {
        await updatePostLikes(req, res);
    })();
});
app.get('/profile', isAuthenticated, (req, res) => {
    (async function () {
        await renderProfile(req, res);
    })();
});
app.get('/avatar/:username', (req, res) => {
    (async function () {
        await handleAvatar(req, res);
    })();
});
app.post('/register', (req, res) => {
    // TODO: Register a new user
    (async function () {
        await registerUser(req, res);
    })();
});
app.post('/login', (req, res) => {
    // TODO: Login a user
    (async function () {
        await loginUser(req, res);
    })();
});

/*
app.get('/logout', (req, res) => {
    // TODO: Logout the user
    logoutUser(req, res);
});
*/

app.post('/delete/:id', isAuthenticated, (req, res) => {
    const postId = parseInt(req.params.id, 10);
    const userId = req.session.userId;
    

    (async function() {
        const user = await findUserById(userId);
        const post = await findPostById(postId);

        // Check if the post exists and if the current user is the owner
        if (post && post.username === user.username) {
            // posts = posts.filter(post => post.id !== postId);
            await db.run(`DELETE FROM posts \
            where id = ${postId}`);
            res.status(200).send("Post deleted");
        } else {
            res.status(401).send("Post not found or you're not authorized to delete this post");
        }
    })();
});

// Google Login Route
app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));

// Google Callback Route
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    async (req, res) => {
        // Extract user's Google ID
        const googleId = req.user.id;
        const user = await findUserByGoogleId(googleId);
        
        if (user) {
            // User exists, set session variables
            req.session.userId = user.id;
            req.session.loggedIn = true;
            res.redirect('/');
        } else {
            // User does not exist, redirect to username registration
            req.session.hashedGoogleId = googleId;
            res.redirect('/registerUsername');
        }
    }
);

// Username Registration Route
app.get('/registerUsername', (req, res) => {
    res.render('registerUsername', { error: req.query.error });
});

// Register Username POST Route
app.post('/registerUsername', async (req, res) => {
    const username = req.body.username;
    const hashedGoogleId = req.session.hashedGoogleId;

    if (await findUserByUsername(username)) {
        res.redirect('/registerUsername?error=Username+taken');
    } else {
        await addUserWithGoogleId(username, hashedGoogleId);
        res.redirect('/login');
    }
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session', err);
            res.redirect('/error');
        } else {
            res.redirect('/googleLogout');
        }
    });
});

// Logout Confirmation Route
app.get('/googleLogout', (req, res) => {
    res.render('googleLogout');
});

app.get('/logoutCallback', (req, res) => {
    res.redirect('/');
});

// render posts by requested option
app.post('/sortOption', (req, res) => {
    sortOrder = req.body['sort-option'];
    res.redirect('/');
});


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~



//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Example data for posts and users
// let posts = [
//     { id: 1, title: 'Sample Post', content: 'This is a sample post.', username: 'SampleUser', timestamp: '2024-01-01 10:00', likes: 0 },
//     { id: 2, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0 },
// ];
// let users = [
//     { id: 1, username: 'SampleUser', avatar_url: undefined, memberSince: '2024-01-01 08:00' },
//     { id: 2, username: 'AnotherUser', avatar_url: undefined, memberSince: '2024-01-02 09:00' },
// ];

async function initializeDB() {
    db = await sqlite.open({filename: dbFileName, driver: sqlite3.Database});
}

// fix me
function addLikedPost(userId, postId) {
    const user = findUserById(userId);
    if (user && !user.likedPosts.includes(postId)) {
        user.likedPosts.push(postId);
    }
}
function hasLikedPost(userId, postId) {
    const user = findUserById(userId);
    return user && user.likedPosts.includes(postId);
}

async function findUserByUsername(username) {
    try {
        return await db.get(`SELECT * FROM users \
        WHERE username = '${username}'`);
    } catch (error) {
        console.error("fail to find user", error);
        return undefined;
    }
    // return users.find(user => user.username === username);
}
async function findUserById(userId) {
    // console.log(`the user id is: ${userId}`);
    if (userId == undefined) {
        return undefined;
    }
    try {
        return await db.get(`SELECT * FROM users \
        WHERE id = ${userId}`);
    } catch (error) {
        console.error("fail to find user", error);
        return undefined;
    }
    // return users.find(user => user.id === userId);
}
async function findPostById(postId) {
    return await db.get(`SELECT * FROM posts \
    where id = ${postId}`);
}


async function addUserWithGoogleId(username, googleId) {
    const avatarUrl = `/avatar/${username}`;
    const newUser = {
        username: username,
        avatar_url: avatarUrl,
        memberSince: new Date(),
        hashedGoogleId: googleId,
    };
    await db.run('INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
        [newUser.username, newUser.hashedGoogleId, newUser.avatar_url, newUser.memberSince]);
}

async function findUserByGoogleId(googleId) {
    try {
        return await db.get(`SELECT * FROM users WHERE hashedGoogleId = ?`, [googleId]);
    } catch (error) {
        console.error("Failed to find user by Google ID", error);
        return undefined;
    }
}



// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Function to register a user
async function registerUser(req, res) {
    // TODO: Register a new user and redirect appropriately
    const username = req.body.username;
    if (await findUserByUsername(req.body.username)) {
        res.redirect("/register?error=Username+taken");
    } else {
        await addUser(username);
        res.redirect("/login");
    }
}

// Function to login a user
async function loginUser(req, res) {
    // TODO: Login a user and redirect appropriately
    let user = await findUserByUsername(req.body.username, db);
    if (user){
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect("/");
    } else {
        res.redirect("/login?error=Invalid+username");
    }
}

// Function to logout a user
function logoutUser(req, res) {
    // TODO: Destroy session and redirect appropriately
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session', err);
            res.redirect('/error');
        } else {
            res.redirect('/');
        }
    });
}

// Function to render the profile page
async function renderProfile(req, res) {
    const user = await getCurrentUser(req);
    if (user) {
        const posts = await getPosts();
        const userPosts = posts.filter(post => post.username === user.username);
        res.render('profile', { user, posts: userPosts });
    } else {
        res.redirect('/login');
    }
}

// Function to update post likes
async function updatePostLikes(req, res) {
    const postId = parseInt(req.params.id, 10);
    const user = await getCurrentUser(req);
    const post = await findPostById(postId);

    if (!post) {
        return res.status(404).json({ success: false, message: "Post not found" });
    }
    if (post.username === user.username) {
        return res.status(400).json({ success: false, message: "You cannot like your own post" });
    }
    // if (hasLikedPost(user.id, postId)) {
    //     return res.status(400).json({ success: false, message: "You have already liked this post" });
    // }

    // Increment the like count and save the post ID in the user's liked posts
    const newLikeCount = post.likes + 1;
    await db.run(`UPDATE posts \
    SET likes = ${newLikeCount} \
    WHERE id = ${postId}`);
    // addLikedPost(user.id, postId);


    return res.status(200).json({ success: true, likes: newLikeCount });
}


// Function to handle avatar generation and serving
async function handleAvatar(req, res) {
    // TODO: Generate and serve the user's avatar image
    const username = req.params.username;
    const user = await findUserByUsername(username);
    if (user) {
        const firstLetter = username.charAt(0).toUpperCase();
        const avatarBuffer = generateAvatar(firstLetter);
        res.setHeader('Content-Type', 'image/png');
        res.send(avatarBuffer);
    } else {
        res.status(404).send('User not found');
    }
}

// Function to get the current user from session
async function getCurrentUser(req) {
    // TODO: Return the user object if the session user ID matches
    return await findUserById(req.session.userId);
}

// Function to get all posts, sorted by latest first
async function getPosts() {
    // return posts.map(post => {
    //     const user = findUserByUsername(post.username);
    //     const avatarUrl = user && user.avatar_url ? user.avatar_url : `/avatar/${post.username}`;
    //     return {
    //         ...post,
    //         avatar_url: avatarUrl,
    //         timestamp: formatDate(post.timestamp) // Ensure timestamp is formatted
    //     };
    // }).reverse();

    let posts = await db.all('SELECT * FROM posts');
    // postList =  posts.map(async post => {
    //         const user = await findUserByUsername(post.username, db);
    //         const avatarUrl = user && user.avatar_url ? user.avatar_url : `/avatar/${post.username}`;
    //         return {
    //             ...post,
    //             avatar_url: avatarUrl,
    //             timestamp: formatDate(post.timestamp) // Ensure timestamp is formatted
    //         };
    //     }).reverse();
    posts = await processPosts(posts);
    return posts.reverse();
}


// Helper function to format dates
function formatDate(date) {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true };
    return new Date(date).toLocaleString('en-US', options).replace(',', '');
}

async function processPosts(posts) {
    for (let i = 0; i < posts.length; i++) {
        const user = await findUserByUsername(posts[i].username);
        const avatarUrl = user && user.avatar_url ? user.avatar_url : `/avatar/${posts[i].username}`;
        posts[i].username = user.username;
        posts[i].avatar_url = avatarUrl;
        posts[i].timestamp = formatDate(posts[i].timestamp);
    }
    return posts;
}


// Function to add a new post
async function addPost(title, content, user) {
    // TODO: Create a new post object and add to posts array
    // { id: 2, title: 'Another Post', content: 'This is another sample
    //  post.', username: 'AnotherUser', 
    // timestamp: '2024-01-02 12:00', likes: 0 },

    const newPost = {
        // id: posts.length + 1,
        title: title,
        content: content,
        username: user.username,
        timestamp: new Date().toISOString(),
        likes: 0,
        avatar_url: user.avatar_url || `/avatar/${user.username}`
    };
    // posts.push(newPost);
    await db.run('INSERT INTO posts \
    (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, ?)',
    [newPost.title, newPost.content, newPost.username, newPost.timestamp, newPost.likes]);
}


// Function to generate an image avatar
function generateAvatar(letter, width = 100, height = 100) {
    // TODO: Generate an avatar image with a letter
    // Steps:
    // 1. Choose a color scheme based on the letter
    // 2. Create a canvas with the specified width and height
    // 3. Draw the background color
    // 4. Draw the letter in the center
    // 5. Return the avatar as a PNG buffer

     // 1. Choose a color scheme based on the letter
    const colors = [
        '#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33A6', '#33FFF3',
    ];
    const color = colors[letter.charCodeAt(0) % colors.length];

    // 2. Create a canvas with the specified width and height
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    // 3. Draw the background color
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);

    // 4. Draw the letter in the center
    context.fillStyle = '#FFFFFF';
    context.font = `${width / 2}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(letter, width / 2, height / 2);

    // 5. Return the avatar as a PNG buffer
    return canvas.toBuffer('image/png');
}


