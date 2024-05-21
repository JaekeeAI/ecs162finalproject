const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const { createCanvas } = require('canvas');

//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Configuration and Setup
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

const app = express();
const PORT = 3000;

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

// Replace any of these variables below with constants for your application. These variables
// should be used in your template files. 
// 
app.use((req, res, next) => {
    res.locals.appName = 'MicroBlog';
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
    const posts = getPosts();
    const user = getCurrentUser(req) || {};
    res.render('home', { posts, user });
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

/*
app.get('/post/:id', (req, res) => {
    // TODO: Render post detail page
});
*/

app.post('/posts', (req, res) => {
    // TODO: Add a new post and redirect to home
    addPost(req.body.title, req.body.postBody, getCurrentUser(req));
    res.redirect("/");
});

app.post('/like/:id', isAuthenticated, (req, res) => {
    updatePostLikes(req, res);
});

app.get('/profile', isAuthenticated, (req, res) => {
    const user = getCurrentUser(req);
    if (user) {
        const userPosts = posts.filter(post => post.username === user.username);
        res.render('profile', { user, posts: userPosts });
    } else {
        res.redirect('/login');
    }
});

app.get('/avatar/:username', (req, res) => {
    const username = req.params.username;
    const user = findUserByUsername(username);
    if (user) {
        const firstLetter = username.charAt(0).toUpperCase();
        const avatarBuffer = generateAvatar(firstLetter);
        res.setHeader('Content-Type', 'image/png');
        res.send(avatarBuffer);
    } else {
        res.status(404).send('User not found');
    }
});

app.post('/register', (req, res) => {
    // TODO: Register a new user
    registerUser(req, res);
});
app.post('/login', (req, res) => {
    // TODO: Login a user
    loginUser(req, res);
});
app.get('/logout', (req, res) => {
    // TODO: Logout the user
    logoutUser(req, res);
});

app.post('/delete/:id', isAuthenticated, (req, res) => {
    const postId = parseInt(req.params.id, 10);
    const user = getCurrentUser(req);

    // Find the post and check if the current user is the owner
    const postIndex = posts.findIndex(post => post.id === postId && post.username === user.username);

    if (postIndex !== -1) {
        // Remove the post from the array
        posts.splice(postIndex, 1);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "Post not found or you're not authorized to delete this post" });
    }
});


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Server Activation
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});


//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Support Functions and Variables
//~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Example data for posts and users
let posts = [
    { id: 1, title: 'Sample Post', content: 'This is a sample post.', username: 'SampleUser', timestamp: '2024-01-01 10:00', likes: 0 },
    { id: 2, title: 'Another Post', content: 'This is another sample post.', username: 'AnotherUser', timestamp: '2024-01-02 12:00', likes: 0 },
];
let users = [
    { id: 1, username: 'SampleUser', avatar_url: undefined, memberSince: '2024-01-01 08:00' },
    { id: 2, username: 'AnotherUser', avatar_url: undefined, memberSince: '2024-01-02 09:00' },
];

// console.log(getPosts());

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

function findUserByUsername(username) {
    return users.find(user => user.username === username);
}

function findUserById(userId) {
    return users.find(user => user.id === userId);
}

// Function to add a new user
function addUser(username) {
    const avatarUrl = `/avatar/${username}`;
    const newUser = {
        id: users.length + 1,
        username: username,
        avatar_url: avatarUrl,
        memberSince: new Date(),
        likedPosts: []
    };
    users.push(newUser);
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
function registerUser(req, res) {
    // TODO: Register a new user and redirect appropriately
    const username = req.body.username;
    if (findUserByUsername(req.body.username)) {
        res.redirect("/register?error=Username+taken");
    } else {
        addUser(username);
        res.redirect("/login");
    }
}

// Function to login a user
function loginUser(req, res) {
    // TODO: Login a user and redirect appropriately
    let user = findUserByUsername(req.body.username);
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
function renderProfile(req, res) {
    const user = getCurrentUser(req);
    if (user) {
        const userPosts = posts.filter(post => post.username === user.username);
        res.render('profile', { user, posts: userPosts });
    } else {
        res.redirect('/login');
    }
}

// Function to update post likes
function updatePostLikes(req, res) {
    const postId = parseInt(req.params.id, 10);
    const user = getCurrentUser(req);

    // Find the post
    const post = posts.find(post => post.id === postId);

    if (!post) {
        return res.json({ success: false, message: "Post not found" });
    }

    if (post.username === user.username) {
        return res.json({ success: false, message: "You cannot like your own post" });
    }

    if (hasLikedPost(user.id, postId)) {
        return res.json({ success: false, message: "You have already liked this post" });
    }

    // Increment the like count and save the post ID in the user's liked posts
    post.likes += 1;
    addLikedPost(user.id, postId);

    return res.json({ success: true, likes: post.likes });
}


// Function to handle avatar generation and serving
function handleAvatar(req, res) {
    // TODO: Generate and serve the user's avatar image
}

// Function to get the current user from session
function getCurrentUser(req) {
    // TODO: Return the user object if the session user ID matches
    return findUserById(req.session.userId);
}

// Function to get all posts, sorted by latest first
function getPosts() {
    return posts.map(post => {
        const user = findUserByUsername(post.username);
        return {
            ...post,
            avatar_url: user ? user.avatar_url : `/avatar/${user.username}`,
            timestamp: formatDate(post.timestamp) // Ensure timestamp is formatted
        };
    }).reverse();
}

// Helper function to format dates
function formatDate(date) {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true };
    return new Date(date).toLocaleString('en-US', options).replace(',', '');
}


// Function to add a new post
function addPost(title, content, user) {
    // TODO: Create a new post object and add to posts array
    // { id: 2, title: 'Another Post', content: 'This is another sample
    //  post.', username: 'AnotherUser', 
    // timestamp: '2024-01-02 12:00', likes: 0 },
    const newPost = {
        id: posts.length + 1,
        title: title,
        content: content,
        username: user.username,
        timestamp: new Date().toISOString(),
        likes: 0,
        avatar_url: user.avatar_url || `/avatar/${user.username}`
    };
    posts.push(newPost);
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

