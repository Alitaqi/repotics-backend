const BADGES = [
  // POSTS
  { name: "Rookie Reporter", check: (u) => u.postsCount >= 1 },
  { name: "Active Reporter", check: (u) => u.postsCount >= 10 },
  { name: "Elite Reporter", check: (u) => u.postsCount >= 30 },

  // COMMENTS
  { name: "First Voice", check: (u) => u.stats.totalComments >= 5 },
  { name: "Community Voice", check: (u) => u.stats.totalComments >= 20 },

  // UPVOTES RECEIVED
  { name: "Trusted Reporter", check: (u) => u.stats.totalUpvotesReceived >= 20 },
  { name: "Public Hero", check: (u) => u.stats.totalUpvotesReceived >= 100 },

  // NEGATIVE (fun but useful)
  { name: "Controversial", check: (u) => u.stats.totalDownvotesReceived >= 20 },
];

const calculateBadges = (user) => {
  return BADGES
    .filter((b) => b.check(user))
    .map((b) => b.name);
};

module.exports = { calculateBadges };