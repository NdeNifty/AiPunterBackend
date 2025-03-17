const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';

// Helper function to fetch data from API-Football
const fetchData = async (endpoint, params = {}) => {
  try {
    const response = await axios.get(`${BASE_URL}/${endpoint}`, {
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io',
      },
      params,
    });
    console.log(`Response from ${endpoint}:`, response.data); // Log the full response
    return response.data;
  } catch (error) {
    console.error(`Error fetching data from ${endpoint}:`, {
      message: error.message,
      response: error.response?.data, // Log the API's error response, if available
    });
    return null;
  }
};

module.exports = { fetchData };