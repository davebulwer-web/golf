// Golfers and their skills. Skills run 0 to 100.
//   power      how far they can hit it
//   accuracy   how tight full shots land around the aim
//   shortGame  the same for lobs, chips and anything inside 100 yards
//   recovery   how well they play from rough, sand, waste and trees
//   putting    how often putts drop
// Computer golfers also have `nerve` (0 to 1): how much risk they'll take for a better spot.

export const PLAYER = {
  name: 'You', shirt: '#d03a2a',
  skills: { power: 55, accuracy: 55, shortGame: 55, recovery: 50, putting: 55 },
};

export const RIVAL = {
  name: 'Bertie', shirt: '#2f6fd6', ai: true, nerve: 0.5,
  skills: { power: 60, accuracy: 52, shortGame: 55, recovery: 55, putting: 50 },
};
