const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs').promises;
const authMiddleware = require('../middleware/auth');
require('dotenv').config();

// Function to engineer features from fixture data
const getFixtureFeatures = (fixture) => {
  const homeFormScore = (fixture.teams_stats.home.stats.form.match(/W/g)?.length * 3 + fixture.teams_stats.home.stats.form.match(/D/g)?.length * 1 || 0) / 15;
  const awayFormScore = (fixture.teams_stats.away.stats.form.match(/W/g)?.length * 3 + fixture.teams_stats.away.stats.form.match(/D/g)?.length * 1 || 0) / 15;
  return {
    homeRank: fixture.teams_stats.home.standings.rank || Infinity,
    awayRank: fixture.teams_stats.away.standings.rank || Infinity,
    homeFormScore,
    awayFormScore,
    homeAvgGoalsScored: fixture.teams_stats.home.stats.goals.for.average,
    awayAvgGoalsConceded: fixture.teams_stats.away.stats.goals.against.average,
    homeAvgCorners: fixture.teams_stats.home.stats.corners.total.average,
    awayAvgCorners: fixture.teams_stats.away.stats.corners.total.average,
  };
};

// Betslip endpoint
router.post('/', authMiddleware, async (req, res) => {
  const { fixtureIds } = req.body; // Array of fixture IDs from user

  if (!fixtureIds || !Array.isArray(fixtureIds)) {
    return res.status(400).json({ message: 'Fixture IDs are required as an array' });
  }

  try {
    // Load the latest fixtures file
    const files = await fs.readdir('data/');
    const fixturesFile = files.find(file => file.startsWith('fixtures_')).replace(/\\/g, '/');
    const fixtures = JSON.parse(await fs.readFile(`data/${fixturesFile}`, 'utf8'));

    // Filter fixtures based on user input
    const selectedFixtures = fixtures.filter(f => fixtureIds.includes(f.fixture.id));

    if (selectedFixtures.length !== fixtureIds.length) {
      return res.status(404).json({ message: 'Some fixtures not found' });
    }

    // Build prompt for AI to suggest low-odds betslip
    const prompt = `
You are a football betting AI designed to generate a betslip with low combined odds for the user. Given the following fixture data, suggest a combination of bets across the markets (1X2, Over 1.5 Goals, Over 9.5 Corners) with the lowest possible odds, ensuring a balanced risk-reward ratio. Prioritize odds below 2.0 where possible and combine at least 2 bets per fixture. Return the total odds and individual bets.

Fixtures:
${selectedFixtures.map(f => `
- Fixture ID: ${f.fixture.id}
  - Teams: ${f.teams.home.name} vs ${f.teams.away.name}
  - Features:
    - Home Rank: ${f.teams_stats.home.standings.rank || 'N/A'}
    - Away Rank: ${f.teams_stats.away.standings.rank || 'N/A'}
    - Home Form Score: ${getFixtureFeatures(f).homeFormScore}
    - Away Form Score: ${getFixtureFeatures(f).awayFormScore}
    - Home Avg Goals Scored: ${f.teams_stats.home.stats.goals.for.average}
    - Away Avg Goals Conceded: ${f.teams_stats.away.stats.goals.against.average}
    - Home Avg Corners: ${f.teams_stats.home.stats.corners.total.average}
    - Away Avg Corners: ${f.teams_stats.away.stats.corners.total.average}
  - Odds: ${JSON.stringify(f.odds)}
`).join('\n')}

Rules:
- Favor 1X2 bets (home win, draw, away win) with odds < 2.0.
- Favor Over 1.5 Goals if (home goals scored + away goals conceded) / 2 > 1.5.
- Favor Over 9.5 Corners if (home corners + away corners) > 9.5.
- Combine at least 2 bets per fixture, multiplying odds for the total.
- Ensure total odds are minimized while covering all selected fixtures.

Output format:
{
  "totalOdds": number,
  "bets": [
    { "fixtureId": number, "market": string, "selection": string, "odd": number },
    ...
  ]
}
`;

    // Send prompt to OpenAI
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const betslip = JSON.parse(response.data.choices[0].message.content);
    res.json(betslip);
  } catch (error) {
    console.error('Error generating betslip:', error.message);
    res.status(500).json({ message: 'Error generating betslip', error: error.message });
  }
});

module.exports = router;