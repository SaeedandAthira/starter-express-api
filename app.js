const express = require('express');
const session = require('express-session');
const { validationResult, query } = require('express-validator');
const bodyParser = require('body-parser');
const { ObjectId } = require('mongodb');
const db = require('./module/movieModule');

const app = express();

const exphbs = require('express-handlebars');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const dotenv = require('dotenv').config();
const cookieParser = require('cookie-parser');
const secretKey = process.env.JWT_SECRET;
var temp = 1;
var isAuthenticatedBool = false;


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.json({ type: 'application/vnd.api+json' }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.use(cookieParser());
app.use(
    session({
        secret: secretKey,
        resave: false,
        saveUninitialized: true,
        cookie: {
            secure: false,
            httpOnly: true,
            maxAge: 3600000,
        },
    })
);

const authenticateUser = (req, res, next) => {
    if (req.session.userId) {
        // User is authenticated
        res.locals.user = { userId: req.session.userId };
        res.locals.username = { username: req.session.username };
        isAuthenticatedBool = true
        next();
    } else {
        res.locals.user = null;
        isAuthenticatedBool = false;
        next();
    }
};

const sessionTimeout = (maxAge) => {
    return (req, res, next) => {
        if (req.session && req.session.userId) {
            const now = Date.now();
            const lastActivity = req.session.lastActivity || now;
            if (now - lastActivity > maxAge) {
                req.session.destroy(() => {
                    res.clearCookie('token');
                    res.locals.user = null;
                    res.redirect('/login');
                });
            } else {
                req.session.lastActivity = now;
                next();
            }
        } else {
            next();
        }
    };
};
function isAuthenticated(req, res, next) {
    if (isAuthenticatedBool) {
      return next();
    }
    res.redirect('/login');
}
app.use(sessionTimeout(3600000));
app.use(authenticateUser);

// Set the view engine to handlebars
app.engine('hbs', exphbs.engine({
    extname: 'hbs',
    runtimeOptions: {
        allowProtoPropertiesByDefault: true,
        allowProtoMethodsByDefault: true,
    },
    helpers: {
        // custom helpers here
        joinArray: function (array, separator) {
            if (Array.isArray(array)) {
                return array.join(separator);
            }
        },
        seq: function (end) {
            const result = [];
            for (let i = 1; i <= end; i++) {
                result.push(i);
            }
            return result;
        },
        gt: function (a) {
            if (a >= 1) {
                return true;
            }
            else {
                return false;
            }
        },
        add: function (value) {
            value = value + 1;
            return value;
        },
        and: function (v1, v2) {
            if (v1 && v2) {
                return true;
            } else {
                return false;
            }
        },
        log: function (message) {
            console.log(message);
        },
        notnull: function (variable) {
            if (variable != null) {
                return true;
            } else {
                return false;
            }
        }
    }
}));

app.set('view engine', 'hbs');
const database = require("./config/database");
const User = require('./models/user');
const { Console } = require('console');

// Initialize MongoDB connection and Movie model
db.initialize(database.url)
    .then(() => {
        console.log("MongoDB Connected");

        app.get('/api/moviesform', (req, res) => {
            temp = 0;
            res.render('formGetMovie');
        });

        app.get('/', (req, res) => {
            res.render('welcome');
        });

        // Define API routes
        app.get('/api/movies', [
            query('page').optional().isInt().toInt(),
            query('perPage').optional().isInt().toInt(),
            query('title').optional().isString().trim(),
        ], async (req, res) => {
            try {
                const errors = validationResult(req);
                if (!errors.isEmpty()) {
                    return res.status(400).json({ errors: errors.array() });
                }

                let { page, perPage, title } = req.query;
                const pageNumber = page ? parseInt(page) : 1;
                const itemsPerPage = perPage || 10;

                const totalMovies = await db.getTotalMoviesCount();
                var totalPages = Math.ceil(totalMovies / itemsPerPage);

                const movies = await db.getAllMovies(pageNumber, itemsPerPage, title);
                temp = totalPages > 1 ? temp + 1 : 0;

                res.render('movies', {
                    page: pageNumber,
                    perPage: itemsPerPage,
                    total: totalMovies,
                    movies: movies,
                    totalPages: totalPages,
                    title: title,
                    temp: temp,
                });
            } catch (error) {
                console.error(error);
                res.render( 'error', {message1: 'Internal Server Error' });
            }
        });

        app.get('/api/findmoviebyid', (req, res) => {
            res.render('getmoviebyid');
        });
        app.get('/api/onemovie', async (req, res) => {
            try {
                const movieId = req.query.id;
                // Check if movieId is defined and not empty
                if (!/^[0-9a-fA-F]{24}$/.test(movieId)) {
                    console.log('Invalid movieId:', movieId);
                    return res.render( 'error', {message1: 'Invalid movieId format', message2: 'Try Again!!'});
                }
                const objectId = new ObjectId(movieId);
                console.log('movieId:', movieId);
                const movies = await db.getMovieById(objectId);
                if (!movies) {
                    return res.render( 'error', {message1: 'Movie not found', message2: 'Try somthing else :)!!' });
                }
                console.log(movies);
                res.render('onemovie', { movies: movies });
            } catch (error) {
                console.error(error);
                res.render( 'error', {message1:  'Internal Server Error' });
            }
        });

        app.get('/api/addmovie', isAuthenticated, (req, res) => {
            res.render('addmovies');
        });
        // Add a new movie using a partial for the insert form
        app.post('/api/movies', async (req, res) => {
            try {
                const data = { ...req.body };
                var movieId = await db.addNewMovie(data);
                console.log('Movie ID:', movieId);
                return res.render('successfull', { message: 'Added', movieId: movieId });
            } catch (error) {
                console.error(error);
                res.render( 'error', {message1:  'Internal Server Error' });
            }
        });

        app.get('/api/update/movies', isAuthenticated, (req, res) => {
            res.render('update');
        });
        app.post('/api/movies/update', isAuthenticated, async (req, res) => {
            try {
                const movieId = req.body.id;
                const data = { ...req.body };
                const updatedMovie = await db.updateMovieById(data, movieId);
                if (updatedMovie) {
                    return res.render('successfull', { message: 'Updated, ', movieId: updatedMovie._id });
                } else {
                    return res.render( 'error', {message1:  'Movie not found' });
                }
            } catch (error) {
                console.error(error);
                res.render( 'error', {message1: 'Internal Server Error' });
            }
        });

        //Delete
        app.get('/api/delete/movie', isAuthenticated, (req, res) => {
            res.render('delete');
        });
        app.post('/api/movies/delete', isAuthenticated, async (req, res) => {
            try {
                const movieId = req.body.id;
                const deletedMovie = await db.deleteMovieById(movieId);
                if (deletedMovie) {
                    return res.render('successfull', { message: 'Delete, ', movieId: movieId });
                } else {
                    return res.render( 'error', {message1: 'Movie not found' });
                }
            } catch (error) {
                console.error(error);
                res.render( 'error', {message1: 'Internal Server Error' });
            }
        });

        app.get('/register', authenticateUser, (req, res) => {
            res.render('register');
        });
        // User registration
        app.post('/auth/register', authenticateUser, async (req, res) => {
            try {
                const { username, password } = req.body;
                const hashedPassword = await bcrypt.hash(password, 10);
                const user = new User({
                    username,
                    password: hashedPassword,
                });
                await user.save();
                res.render('successfull', { message: 'User Registration' });
            } catch (error) {
                res.render( 'error', {message1: error.message });
            }
        });

        app.get('/login', (req, res) => {
            res.render('login');
        });
        app.post('/auth/login', async (req, res) => {
            try {
                const { username, password } = req.body;
                // Find the user by username
                user = await User.findOne({ username });
                if (!user) {
                    return res.render( 'error', {message1: 'Invalid credentials' });
                }
                // Compare passwords
                const isPasswordValid = await bcrypt.compare(password, user.password);
                if (!isPasswordValid) {
                    return res.render( 'error', {message1: 'Invalid credentials' });
                }
                // Generate a JWT token
                const token = jwt.sign({ userId: user._id, username: user.username }, secretKey);
                // Set the token as a cooki
                const oneHourFromNow = new Date();
                oneHourFromNow.setTime(oneHourFromNow.getTime() + 60 * 60 * 1000); // 1 hour in milliseconds

                res.cookie('token', token, {
                    expires: oneHourFromNow,
                    httpOnly: true,
                });
                req.session.userId = user._id;
                req.session.username = user.username;
                res.redirect('/api/movies');
            }
            catch (error) {
                res.render( 'error', {message1: error.message });
            }
        });
        app.get('/logout', (req, res) => {
            req.session.destroy(() => {
                res.clearCookie('token');
                res.locals.user = null;
                res.redirect('/api/movies');
            });
        });

        app.get('*', (req, res) => {
            res.render('error', {message1: 'Oops! I think you are lost!!', message2: 'I hope you find your way out :)'})
        });
        // Start the server
        app.listen(6500, () => {
            console.log("App listening on port : " + 6500);
        });
    })
    .catch((error) => {
        // Handle initialization error
        console.error("MongoDB connection error:", error);
    });
