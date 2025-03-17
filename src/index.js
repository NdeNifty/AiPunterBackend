const express = require('express');
const { fetchWeeklyData, scheduleWeeklyFetch } = require('./jobs/fetchWeeklyData');

const app = express();
const port = 5000;

// Middleware to parse JSON
app.use(express.json());

// Endpoint to manually trigger the data fetch (for testing)
app.get('/fetch-data', async (req, res) => {
  try {
    await fetchWeeklyData();
    res.json({ message: 'Data fetch triggered successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching data', error: error.message });
  }
});

// Start the cron job
scheduleWeeklyFetch();

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});