const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Bike = require('../models/Bike');
const Transaction = require('../models/Transaction');
const Event = require('../models/Event');
const EventRegistration = require('../models/EventRegistration'); // Import the model
const session = require('express-session');
const nodemailer = require('nodemailer')

// Middleware to check session user
const checkSession = (req, res, next) => {
    if (req.session.userName) {
        return next();
    }
    res.redirect('/login');
};

// Home page route
router.get('/', (req, res) => {
    res.render('index');
});

// Register page route
router.get('/register', (req, res) => {
    res.render('register');
});

// Handle user registration
router.post('/create-user', async (req, res) => {
    const { firstName, lastName, email, password, phone, age } = req.body;

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('register', { errorMessage: 'User Already Exists. Please log in.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ firstName, lastName, email, password: hashedPassword, phone, age });
        await newUser.save();
        
        req.session.userName = firstName;
        res.redirect('/welcome');
    } catch (err) {
        console.error(err);
        res.redirect('/register');
    }
});

// Login page route
router.get('/login', (req, res) => {
    res.render('login');
});

// Handle user login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.render('login', { errorMessage: 'Wrong Email Or Password' });
    }

    req.session.userName = user.firstName;
    res.redirect('/welcome');
});

// Welcome page route
router.get('/welcome', checkSession, (req, res) => {
    const name = req.session.userName;
    res.render('welcome', { name });
});

// Shop page route
router.get('/shop', async (req, res) => {
    try {
        const bikes = await Bike.find();
        res.render('shop', { bikes });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
});

// Rent page route
router.get('/rent', async (req, res) => {
    try {
        const bikes = await Bike.find();
        res.render('rent', { bikes });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Rent now route
router.get('/rent-now/:id', async (req, res) => {
    try {
        const bike = await Bike.findById(req.params.id);
        if (!bike) {
            return res.status(404).render('error', { errorMessage: 'Bike not found' });
        }
        res.render('rent-details', { bike });
    } catch (err) {
        console.error('Error fetching bike details:', err);
        res.status(500).render('error', { errorMessage: 'Internal server error' });
    }
});


// Handle rental checkout
router.post('/rent-now/:id/checkout', async (req, res) => {
    try {
        const bike = await Bike.findById(req.params.id);
        if (!bike) {
            return res.status(404).render('error', { errorMessage: 'Bike not found' });
        }

        const { days, totalPrice } = req.body;
        if (!days || isNaN(days) || !totalPrice) {
            return res.status(400).render('error', { errorMessage: 'Invalid rental details' });
        }

        const user = await User.findOne({ firstName: req.session.userName });
        if (!user) {
            return res.redirect('/login');
        }

        res.render('checkout', {
            userName: req.session.userName,
            bike,
            numberOfDays: days,
            totalPayment: totalPrice
        });
    } catch (err) {
        console.error('Error during rental checkout:', err);
        res.status(500).render('error', { errorMessage: 'Internal server error' });
    }
});

// Route to display bike details for purchase
router.get('/buy-now/:id', async (req, res) => {
    try {
        const bike = await Bike.findById(req.params.id);
        if (!bike) {
            return res.redirect('/shop');
        }

        const relatedBikes = await Bike.find({
            category: bike.category,
            _id: { $ne: bike._id }
        }).limit(4);

        res.render('buy-now', { bike, relatedBikes });
    } catch (err) {
        console.error(err);
        res.redirect('/shop');
    }
});

// Route to handle payment for purchase
router.get('/payment', async (req, res) => {
    const bikeId = req.query.bikeId;

    try {
        const bike = await Bike.findById(bikeId);
        if (!bike) {
            return res.status(404).send('Bike not found');
        }

        res.render('payment', { bike });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

// Handle purchase processing
router.post('/process-purchase', async (req, res) => {
    const { cardName, bikeId } = req.body;

    try {
        const bike = await Bike.findById(bikeId);
        if (!bike) {
            return res.status(404).send('Bike not found');
        }

        const transaction = new Transaction({
            userName: req.session.userName,
            bikeId,
            type: 'purchase',
            totalPrice: bike.price,
        });

        await transaction.save();

        const user = await User.findOne({ firstName: req.session.userName });
        if (!user) {
            return res.status(404).send('User not found');
        }

        user.orders.push({
            bikes: [{ bikeId, quantity: 1 }],
            totalPrice: bike.price,
            date: new Date(),
        });

        await user.save();

        res.render('thank-you', {
            cardName,
            bikeName: bike.name,
            bikePrice: bike.price,
        });
    } catch (error) {
        console.error('Error processing purchase:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Handle rental completion
router.post('/complete-rent', async (req, res) => {
    const { userName, bikeId, numberOfDays, totalPayment } = req.body;
    const numericTotalPayment = parseFloat(totalPayment.replace('₹', '').replace(',', ''));

    try {
        const bike = await Bike.findById(bikeId);
        if (!bike) {
            return res.status(404).send('Bike not found');
        }

        const user = await User.findOne({ firstName: userName });
        if (!user) {
            return res.status(404).send('User not found');
        }

        const transaction = new Transaction({
            userName,
            bikeId,
            type: 'rental',
            totalPrice: numericTotalPayment,
        });

        await transaction.save();

        user.orders.push({
            userName:userName,
            bikes: [{ bikeId, quantity: 1 }],
            totalPrice: numericTotalPayment,
            date: new Date(),
        });

        await user.save();

        res.render('thank-you-rent', {
            userName,
            bike,
            numberOfDays,
            totalPayment: numericTotalPayment,
        });
    } catch (err) {
        console.error('Error processing rental:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Route to display user's transactions
router.get('/my-transactions', checkSession, async (req, res) => {
    try {
        const userName = req.session.userName;

        console.log('Session User Name:', userName); // Debug session user name

        const user = await User.findOne({ firstName: userName }).populate({
            path: 'orders.bikes.bikeId',
            model: 'Bike'
        });

        if (!user) {
            console.log('User not found'); // Debug user not found
            return res.status(404).send('User not found');
        }

        console.log('User Data:', user); // Debug user data

        const transactions = user.orders;

        res.render('my-transactions', { transactions ,userName});
    } catch (err) {
        console.error('Error fetching transactions:', err);
        res.status(500).send('Internal Server Error');
    }
});


// Service route

router.get('/service', (req, res) => {
    res.render('service');
});

router.get('/fuel-calculator', (req, res) => {
    res.render('fuel-calculator');
});

router.get('/mileage-calculator',(req,res)=>{
    res.render('mileage-calculator');
});

router.get('/meetups', (req, res) => {
    const events = [
        {
            name: 'Mountain Adventure Ride',
            image: 'https://plus.unsplash.com/premium_photo-1661870277562-53f9b176fc75?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
            date: '2024-11-15',
            location: 'Shimla, Himachal Pradesh',
            price: 2000,
            description: 'Join us for a thrilling ride through the majestic mountains.',
            registrationLink: 'https://example.com/register/mountain-ride'
        },
        {
            name: 'Coastal Highway Trip',
            image: 'https://images.unsplash.com/photo-1596687760372-4c0d266059a7?q=80&w=1964&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
            date: '2024-12-05',
            location: 'Goa',
            price: 2000,
            description: 'Join us for a thrilling ride through the majestic mountains.',
            registrationLink: 'https://example.com/register/coastal-trip'        },
        {
            name: 'Night City Tour',
            image: 'https://images.unsplash.com/photo-1666092197965-eb4794bc2c37?q=80&w=1887&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
            date: '2024-10-25',
            location: 'Mumbai',
            price: 2000,
            description: 'Join us for a thrilling ride through the majestic mountains.',
            registrationLink: 'https://example.com/register/city-tour'
        }
    ];

    res.render('meetups', { events });
});


// Registration forms

router.get('/register/:slug', async (req, res) => {
    try {
        const event = await Event.findOne({ slug: req.params.slug });

        if (!event) {
            return res.status(404).render('error', { errorMessage: 'Event not found.' });
        }

        res.render('event-registration', { event });
    } catch (error) {
        console.error('Error fetching event:', error);
        res.status(500).render('error', { errorMessage: 'Internal Server Error' });
    }
});
router.post('/register/:slug', async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        const event = await Event.findOne({ slug: req.params.slug });

        if (!event) {
            return res.status(404).render('error', { errorMessage: 'Event not found.' });
        }

        const newRegistration = new EventRegistration({
            name,
            email,
            phone,
            event: event.name,
        });

        await newRegistration.save();

        res.render('registration-success', { name, event: event.name });
    } catch (error) {
        console.error('Error registering for event:', error);
        res.status(500).render('error', { errorMessage: 'Registration failed. Please try again later.' });
    }
});


router.get('/events', async (req, res) => {
    try {
        const events = await Event.find();
        res.render('events', { events });
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).render('error', { errorMessage: 'Internal Server Error' });
    }
});

router.get('/maintenance-tips', (req, res) => {
    res.render('maintenance-tips', {
        title: 'Bike Maintenance Tips'
    });
});
router.get('/safety-training', (req, res) => {
    res.render('safety-training', {
        title: 'Bike Safety Training'
    });
});

// Custom Tours Route
router.get('/custom-tours', (req, res) => {
    res.render('custom-tours', {
        title: 'Custom Bike Tours'
    });
});



router.get('/register-custom-tour', (req, res) => {
    res.render('register-custom-tour', {
        title: 'Register for Custom Bike Tour'
    });
});

// Handle POST request for Custom Tour Registration
router.post('/register-custom-tour', (req, res) => {
    const { name, email, preferences, participants, date } = req.body;

    // Email sending logic
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Use your email service provider
        auth: {
            user: 'sarthakjm2284@gmail.com', // Your email address
            pass: 'qmwa xece rdah qnsw' // Your email password (or app password)
        }
    });

    const mailOptions = {
        from: 'sathakjm2284@gmail.com', // Sender's email
        to: email, // Recipient's email
        subject: 'Custom Bike Tour Registration Confirmation',
        text: `Thank you ${name} for registering for the Custom Bike Tour!\n\nHere are your registration details:\n- Name: ${name}\n- Email: ${email}\n- Participants: ${participants}\n- Preferred Date: ${date}\n- Preferences: ${preferences}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
            return res.status(500).send('Error sending email.');
        }
        console.log('Email sent:', info.response);
        res.render('thank-you-email',{
            title: 'Thank-you'
        });
    });
});



// Logout route
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Error logging out');
        }
        res.redirect('/');
    });
});

// Error page route
router.get('/error', (req, res) => {
    res.render('error');
});

// 404 page route
router.use((req, res) => {
    res.status(404).render('error', { errorMessage: 'Page Not Found' });
});

module.exports = router;


