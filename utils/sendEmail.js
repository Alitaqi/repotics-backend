const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendCrimeAlertEmail = async (to, post) => {
  const mailOptions = {
    from: `"Reportics Alert System" <${process.env.EMAIL_USER}>`,
    to,
    subject: `🚨 Crime Alert Near You - ${post.crimeType}`,
    html: `
      <div style="font-family: Arial; padding: 10px;">
        <h2>🚨 Crime Reported Near You</h2>

        <p><b>Type:</b> ${post.crimeType}</p>
        <p><b>Location:</b> ${post.locationText}</p>
        <p><b>Date:</b> ${post.date} at ${post.time}</p>

        <p>${post.aiReport?.shortSummary || post.incidentDescription}</p>

        <hr />

        <h3>🛡 Safety Tips:</h3>
        <ul>
          <li>Avoid the reported area if possible</li>
          <li>Stay alert and avoid isolated places</li>
          <li>Share your live location with trusted contacts</li>
          <li>Contact authorities if you notice anything suspicious</li>
        </ul>

        <p style="color: gray;">Stay safe,<br/>Reportics AI System</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendCrimeAlertEmail };