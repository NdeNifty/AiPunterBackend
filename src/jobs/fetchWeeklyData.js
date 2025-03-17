const axios = require('axios');
const fs = require('fs').promises;
const cron = require('node-cron');
require('dotenv').config();

// Utility function to fetch fixture data
const fetchData = async (dateFrom, dateTo) => {
  try {
    const response = await axios.get('https://api-football.com/v1/fixtures', {
      params: {
        dateFrom,
        dateTo,
        timezone: 'UTC',
      },
      headers: {
        'x-apisports-key': process.env.API_FOOTBALL_KEY,
      },
    });
    return response.data.response;
  } catch (error) {
    console.error('Error fetching fixture data:', error.message);
    throw error;
  }
};

// Function to fetch odds for a specific fixture
const fetchOdds = async (fixtureId) => {
  try {
    const response = await axios.get('https://api-football.com/v1/odds', {
      params: {
        fixture: fixtureId,
        bookmakers: 'all', // Fetch odds from all available bookmakers
      },
      headers: {
        'x-apisports-key': process.env.API_FOOTBALL_KEY,
      },
    });
    return response.data.response[0]?.bookmakers.flatMap(b => b.bets) || []; // Flatten odds data
  } catch (error) {
    console.error(`Error fetching odds for fixture ${fixtureId}:`, error.message);
    return [];
  }
};

// Function to fetch statistics for a specific fixture
const fetchStatistics = async (fixtureId) => {
  try {
    const response = await axios.get('https://api-football.com/v1/fixtures/statistics', {
      params: {
        fixture: fixtureId,
      },
      headers: {
        'x-apisports-key': process.env.API_FOOTBALL_KEY,
      },
    });
    return response.data.response[0]; // Assuming the first response item contains stats
  } catch (error) {
    console.error(`Error fetching statistics for fixture ${fixtureId}:`, error.message);
    return {};
  }
};

// Main function to fetch and enrich weekly data
const fetchWeeklyData = async () => {
  console.log('Fetching weekly data for all available fixtures...');
  const today = new Date();
  const dateFrom = today.toISOString().split('T')[0]; // e.g., "2025-03-17"
  const dateTo = new Date(today.setDate(today.getDate() + 2)).toISOString().split('T')[0]; // 3 days window

  try {
    const fixtures = await fetchData(dateFrom, dateTo);

    const enrichedFixtures = [];

    for (const fixture of fixtures) {
      const odds = await fetchOdds(fixture.fixture.id);
      const stats = await fetchStatistics(fixture.fixture.id);
      const homeTeamStats = stats.teams?.home || {};
      const awayTeamStats = stats.teams?.away || {};

      const enrichedFixture = {
        fixture: {
          id: fixture.fixture.id,
          date: fixture.fixture.date,
        },
        teams: {
          home: { id: fixture.teams.home.id, name: fixture.teams.home.name },
          away: { id: fixture.teams.away.id, name: fixture.teams.away.name },
        },
        odds: odds.map(odd => ({
          market: odd.market,
          values: odd.values.map(v => ({ value: v.value, odd: v.odd })),
        })),
        teams_stats: {
          home: {
            id: fixture.teams.home.id,
            stats: {
              form: homeTeamStats.form || 'N/A',
              goals: {
                for: { average: homeTeamStats.goals?.for?.average || 0 },
                against: { average: homeTeamStats.goals?.against?.average || 0 },
              },
              corners: { total: { average: homeTeamStats.corners?.total?.average || 0 } },
            },
            standings: fixture.league.standings?.[0]?.find(t => t.team.id === fixture.teams.home.id) || {},
          },
          away: {
            id: fixture.teams.away.id,
            stats: {
              form: awayTeamStats.form || 'N/A',
              goals: {
                for: { average: awayTeamStats.goals?.for?.average || 0 },
                against: { average: awayTeamStats.goals?.against?.average || 0 },
              },
              corners: { total: { average: awayTeamStats.corners?.total?.average || 0 } },
            },
            standings: fixture.league.standings?.[0]?.find(t => t.team.id === fixture.teams.away.id) || {},
          },
        },
      };

      enrichedFixtures.push(enrichedFixture);
    }

    // Save to JSON files (simplified structure for betslip focus)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await fs.writeFile(
      `data/fixtures_${timestamp}.json`,
      JSON.stringify(enrichedFixtures, null, 2)
    );

    console.log(`Successfully fetched and enriched ${enrichedFixtures.length} fixtures.`);
  } catch (error) {
    console.error('Error in fetchWeeklyData:', error.message);
  }
};

// Schedule the cron job to run every 3 days (Sunday, Wednesday, Saturday at midnight UTC)
const scheduleWeeklyFetch = () => {
  cron.schedule('0 0 * * 0,3,6', () => {
    console.log('Running 3-day data fetch...');
    fetchWeeklyData();
  });
};

module.exports = { fetchWeeklyData, scheduleWeeklyFetch };