module.exports = (req, res) => {
  res.status(200).json({
    message: "Agent API is running",
    timestamp: new Date().toISOString()
  });
};
