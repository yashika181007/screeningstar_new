const nodemailer = require("nodemailer");
const connection = require("../../../../config/db"); // Import the existing MySQL connection

// Function to generate HTML table from service details
const generateTable = (services) => {
  console.log(services);
  if (!Array.isArray(services) || services.length === 0) {
    return `<tr>
              <td colspan="3" style="text-align: center;">No instructions available for the selected services.</td>
            </tr>`;
  }

  let rows = "";

  services.forEach((service, index) => {
    // Split the service into title and description
    const [title, description] = service.split(":");

    rows += `<tr>
                <td>${index + 1}</td> <!-- Serial number -->
                <td>${title}</td> <!-- Title -->
                <td>${description.trim()}</td> <!-- Description -->
              </tr>`;
  });

  return rows;
};

// Function to send email
async function createMail(
  module,
  action,
  name,
  application_id,
  href,
  services,
  toArr,
  ccArr
) {
  try {
    // Fetch email template
    const [emailRows] = await connection
      .promise()
      .query(
        "SELECT * FROM emails WHERE module = ? AND action = ? AND status = 1",
        [module, action]
      );
    if (emailRows.length === 0) throw new Error("Email template not found");
    const email = emailRows[0];

    // Fetch SMTP credentials
    const [smtpRows] = await connection
      .promise()
      .query(
        "SELECT * FROM smtp_credentials WHERE module = ? AND action = ? AND status = '1'",
        [module, action]
      );
    if (smtpRows.length === 0) throw new Error("SMTP credentials not found");
    const smtp = smtpRows[0];

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure, // true for 465, false for other ports
      auth: {
        user: smtp.username,
        pass: smtp.password,
      },
    });

    // Generate the HTML table from service details
    const table_rows = generateTable(services);

    // Replace placeholders in the email template
    let template = email.template;
    template = template
      .replace(/{{candidate_name}}/g, name)
      .replace(/{{table_rows}}/g, table_rows)
      .replace(/{{form_href}}/g, href);

    // Prepare CC list
    const ccList = ccArr
      .map((entry) => {
        let emails = [];

        try {
          // Case 1: If it's already an array, use it
          if (Array.isArray(entry.email)) {
            emails = entry.email;
          } else if (typeof entry.email === "string") {
            // Case 2: If it's a JSON string (with brackets and quotes), clean and parse it
            let cleanedEmail = entry.email.trim();

            // Remove extra quotes and backslashes from the string
            cleanedEmail = cleanedEmail
              .replace(/\\"/g, '"')
              .replace(/^"|"$/g, "");

            // Check if the cleaned email is a JSON array
            if (cleanedEmail.startsWith("[") && cleanedEmail.endsWith("]")) {
              emails = JSON.parse(cleanedEmail);
            } else {
              // Case 3: If it's a plain string email, use it directly
              emails = [cleanedEmail];
            }
          }
        } catch (e) {
          console.error("Error parsing email JSON:", entry.email, e);
          return ""; // Skip this entry if parsing fails
        }

        // Ensure that emails array contains valid items, and format them
        return emails
          .filter((email) => email) // Ensure it's a valid non-empty string
          .map((email) => `"${entry.name}" <${email}>`)
          .join(", ");
      })
      .filter((cc) => cc !== "") // Remove any empty CCs from failed parses
      .join(", ");

    // Validate recipient email(s)
    if (!toArr || toArr.length === 0) {
      throw new Error("No recipient email provided");
    }

    // Prepare recipient list
    const toList = toArr
      .map((email) => `"${email.name}" <${email.email}>`)
      .join(", ");

    // Debugging: Log the email lists
    console.log("Recipient List:", toList);
    console.log("CC List:", ccList);

    // Send email
    const info = await transporter.sendMail({
      from: smtp.username,
      to: toList, // Main recipient list
      cc: ccList, // CC recipient list
      subject: email.title,
      html: template,
    });

    console.log("Email sent:", info.response);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

module.exports = { createMail };