const express = require('express');
const session = require('express-session');
const passport = require('./config/passport');
const sequelize = require('./config/database');
const authRoutes = require('./routes/auth');
const { fetchWeeklyData, scheduleWeeklyFetch } = require('./jobs/fetchWeeklyData');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(
  session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', authRoutes);
app.use('/betslip', betslipRoutes);

// Existing route for fetching data
app.get('/fetch-data', async (req, res) => {
  try {
    await fetchWeeklyData();
    res.status(200).json({ message: 'Data fetched successfully' });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ message: 'Error fetching data' });
  }
});

// Sync database and start server
const PORT = process.env.PORT || 5000;
const startServer = async () => {
  try {
    await sequelize.sync({ force: true }); // Creates tables (force: true drops existing tables)
    console.log('Database synced successfully');

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      scheduleWeeklyFetch(); // Start the scheduled data fetch
    });
  } catch (error) {
    console.error('Error starting server:', error);
  }
};

startServer();