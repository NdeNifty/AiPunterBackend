const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const { fetchData } = require('../utils/apiFootball');

// Helper function to generate an array of dates between startDate and endDate
const getDateRange = (startDate, endDate) => {
  const dates = [];
  let currentDate = new Date(startDate);
  const end = new Date(endDate);

  while (currentDate <= end) {
    dates.push(currentDate.toISOString().split('T')[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
};

// Function to clean up a fixture object by removing unnecessary fields
const cleanFixture = (fixtureData) => {
  return {
    id: fixtureData.fixture.id,
    date: fixtureData.fixture.date,
  };
};

// Function to clean up a team object by removing unnecessary fields
const cleanTeam = (teamData) => {
  return {
    id: teamData.id,
    name: teamData.name,
  };
};

// Function to clean up H2H fixture data
const cleanH2HFixture = (h2hFixture) => {
  return {
    fixture: {
      id: h2hFixture.fixture.id,
      date: h2hFixture.fixture.date,
    },
    teams: {
      home: cleanTeam(h2hFixture.teams.home),
      away: cleanTeam(h2hFixture.teams.away),
    },
    goals: h2hFixture.goals, // Keep for H2H analysis
  };
};

// Function to fetch and store weekly data for all available fixtures
const fetchWeeklyData = async () => {
  console.log('Fetching weekly data for all available fixtures...');
  const currentDate = new Date();

  // Restrict date range to 3 days to comply with plan limitation
  const fromDate = '2025-03-16'; // Start of the allowed range
  const toDate = '2025-03-18';   // End of the allowed range
  const dateRange = getDateRange(fromDate, toDate);
  console.log(`Fetching fixtures for dates: ${dateRange.join(', ')}`);

  // Step 1: Fetch fixtures for each day in the date range
  let allFixtures = [];
  for (const date of dateRange) {
    console.log(`Fetching fixtures for ${date}...`);
    const fixturesData = await fetchData('fixtures', {
      date: date,
    });

    if (!fixturesData || !fixturesData.response) {
      console.error(`No data retrieved for ${date}.`, fixturesData?.errors || {});
      continue;
    }

    const fixturesForDate = fixturesData.response;
    // Filter out canceled matches
    const validFixtures = fixturesForDate.filter(fixture => fixture.fixture.status.short !== 'CANC');
    console.log(`Found ${validFixtures.length} valid fixtures for ${date} (after filtering canceled matches)`);
    if (validFixtures.length === 0 && fixturesData.errors?.plan) {
      console.warn(`Plan limitation error for ${date}: ${fixturesData.errors.plan}`);
    }
    allFixtures = allFixtures.concat(validFixtures);
  }

  console.log(`Found ${allFixtures.length} total valid fixtures from ${fromDate} to ${toDate}`);

  if (allFixtures.length === 0) {
    console.warn('No fixtures found for the specified date range across any league.');
    return;
  }

  // Step 2: Enrich each fixture with additional data
  const domesticFixtures = [];
  const internationalFixtures = [];

  for (const fixture of allFixtures) {
    const fixtureId = fixture.fixture.id;
    const homeTeamId = fixture.teams.home.id;
    const awayTeamId = fixture.teams.away.id;
    const leagueId = fixture.league.id;
    const season = fixture.league.season;
    const country = fixture.league.country;

    console.log(`Processing fixture ID ${fixtureId}: ${fixture.teams.home.name} vs ${fixture.teams.away.name}`);

    // Fetch pre-match odds
    const oddsData = await fetchData('odds', {
      fixture: fixtureId,
      bookmaker: 8, // Example bookmaker ID (e.g., Bet365)
      bet: 1, // Example bet type (e.g., 1X2)
    });

    // Fetch head-to-head data
    const h2hData = await fetchData('fixtures/headtohead', {
      h2h: `${homeTeamId}-${awayTeamId}`,
    });

    // Fetch team statistics
    const homeTeamStats = await fetchData('teams/statistics', {
      team: homeTeamId,
      league: leagueId,
      season: season,
    });

    const awayTeamStats = await fetchData('teams/statistics', {
      team: awayTeamId,
      league: leagueId,
      season: season,
    });

    // Fetch standings
    const homeTeamStandings = await fetchData('standings', {
      league: leagueId,
      season: season,
      team: homeTeamId,
    });

    const awayTeamStandings = await fetchData('standings', {
      league: leagueId,
      season: season,
      team: awayTeamId,
    });

    // Clean and structure the enriched fixture data
    const enrichedFixture = {
      fixture: cleanFixture(fixture),
      teams: {
        home: cleanTeam(fixture.teams.home),
        away: cleanTeam(fixture.teams.away),
      },
      odds: oddsData?.response || [],
      h2h: h2hData?.response ? h2hData.response.map(cleanH2HFixture) : [],
      teams_stats: {
        home: {
          id: homeTeamId,
          stats: homeTeamStats?.response || {},
          standings: homeTeamStandings?.response?.[0] || {},
        },
        away: {
          id: awayTeamId,
          stats: awayTeamStats?.response || {},
          standings: awayTeamStandings?.response?.[0] || {},
        },
      },
      // Removed injuries field
    };

    // Determine if the fixture is domestic or international
    if (country === 'World') {
      internationalFixtures.push(enrichedFixture);
    } else {
      domesticFixtures.push(enrichedFixture);
    }
  }

  // Step 3: Group domestic fixtures by country (optional, if you need grouping)
  const domesticDataByCountry = {};
  for (const fixture of domesticFixtures) {
    const country = fixture.league?.country || 'Unknown'; // Use a fallback if country is removed
    const leagueName = fixture.league?.name || 'Unknown League';

    if (!domesticDataByCountry[country]) {
      domesticDataByCountry[country] = {};
    }

    if (!domesticDataByCountry[country][leagueName]) {
      domesticDataByCountry[country][leagueName] = {
        name: leagueName,
        fixtures: [],
      };
    }

    domesticDataByCountry[country][leagueName].fixtures.push(fixture);
  }

  // Step 4: Group international fixtures by competition (optional, if you need grouping)
  const internationalDataByCompetition = {};
  for (const fixture of internationalFixtures) {
    const competitionName = fixture.league?.name || 'Unknown Competition';

    if (!internationalDataByCompetition[competitionName]) {
      internationalDataByCompetition[competitionName] = {
        name: competitionName,
        fixtures: [],
      };
    }

    internationalDataByCompetition[competitionName].fixtures.push(fixture);
  }

  // Step 5: Save domestic and international fixtures to separate JSON files
  const outputDate = currentDate.toISOString().split('T')[0]; // Use current date for file naming
  const domesticFilePath = path.join(__dirname, '..', '..', 'data', `domestic_fixtures_${outputDate}.json`);
  await fs.writeFile(domesticFilePath, JSON.stringify(domesticDataByCountry, null, 2));
  console.log(`Domestic data saved to ${domesticFilePath}`);

  const internationalFilePath = path.join(__dirname, '..', '..', 'data', `international_fixtures_${outputDate}.json`);
  await fs.writeFile(internationalFilePath, JSON.stringify(internationalDataByCompetition, null, 2));
  console.log(`International data saved to ${internationalFilePath}`);

  // Step 6: Log summary
  if (domesticFixtures.length === 0 && internationalFixtures.length === 0) {
    console.warn('No fixtures found for the specified date range.');
  } else {
    console.log(`Successfully fetched ${domesticFixtures.length} domestic fixtures and ${internationalFixtures.length} international fixtures.`);
  }
};

// Schedule the cron job to run every 3 days (e.g., Sunday, Wednesday, Saturday)
const scheduleWeeklyFetch = () => {
  cron.schedule('0 0 * * 0,3,6', () => { // Runs at midnight on Sunday (0), Wednesday (3), and Saturday (6)
    console.log('Running 3-day data fetch...');
    fetchWeeklyData();
  });
};

module.exports = { fetchWeeklyData, scheduleWeeklyFetch };