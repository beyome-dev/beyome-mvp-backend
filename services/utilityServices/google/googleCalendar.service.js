const config = require('../../../config');
const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const redirectUri = config.APP_URL + "/oauth2callback";

// Returns OAuth2 client configured with handler tokens
function getOAuthClient(tokens) {
  const oAuth2Client = new google.auth.OAuth2(
    config.google.clientID,
    config.google.clientSecret,
    redirectUri
  );
  oAuth2Client.setCredentials(tokens);
  return oAuth2Client;
}

// Add booking event to handler's Google Calendar
async function addBookingEvent(booking, tokens) {
  const auth = getOAuthClient(tokens);
  const calendar = google.calendar({ version: "v3", auth });

  const startDateTime = `${booking.date}T${booking.time}:00`;
  const [hour, minute] = booking.time.split(":").map(Number);
  const endDateTime = `${booking.date}T${String(hour + 1).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;

  const event = {
    summary: `Booking: ${booking.visitType}`,
    description: `Client: ${booking.customerName}`,
    start: { dateTime: startDateTime, timeZone: "Asia/Kolkata" },
    end: { dateTime: endDateTime, timeZone: "Asia/Kolkata" },
  };

  const response = await calendar.events.insert({
    calendarId: "primary",
    resource: event,
  });

  return response.data.id; // return eventId to store in booking if needed
}

// Remove event from handler's Google Calendar
async function removeBookingEvent(eventId, tokens) {
  const auth = getOAuthClient(tokens);
  const calendar = google.calendar({ version: "v3", auth });

  await calendar.events.delete({
    calendarId: "primary",
    eventId,
  });
}

async function patchBookingEvent(eventId, booking, tokens) {
  const auth = getOAuthClient(tokens);
  const calendar = google.calendar({ version: "v3", auth });

  const startDateTime = `${booking.date}T${booking.time}:00`;
  const [hour, minute] = booking.time.split(":").map(Number);
  const endDateTime = `${booking.date}T${String(hour + 1).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;

  const event = {
    summary: `Booking: ${booking.customerName}`,
    description: `Client: ${booking.customerName}
      Visit Type: ${booking.visitType}`,
    start: { dateTime: startDateTime, timeZone: "Asia/Kolkata" },
    end: { dateTime: endDateTime, timeZone: "Asia/Kolkata" }
  };

  return await calendar.events.patch({
    calendarId: "primary",
    eventId,
    resource: event
  });
}
// Update booking event by deleting and creating again
async function updateBookingEvent(oldEventId, booking, tokens) {
  await removeBookingEvent(oldEventId, tokens);
  return await addBookingEvent(booking, tokens);
}

// Generate Google OAuth2 consent URL
function getAuthUrl(userEmail) {
  const oAuth2Client = new google.auth.OAuth2(
    config.google.clientID,
    config.google.clientSecret,
    redirectUri
  );

  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    login_hint: userEmail  //  Restrict or suggests the email
  });
}

// Exchange code for tokens
async function getTokensFromCode(code) {
  const oAuth2Client = new google.auth.OAuth2(
    config.google.clientID,
    config.google.clientSecret,
    redirectUri
  );
  const { tokens } = await oAuth2Client.getToken(code);
  return tokens;
}

module.exports = {
  addBookingEvent,
  removeBookingEvent,
  patchBookingEvent,
  updateBookingEvent,
  getAuthUrl,
  getTokensFromCode,
};