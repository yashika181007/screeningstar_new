const ClientSpoc = require("../../models/admin/clientSpocModel");
const Common = require("../../models/admin/commonModel");

// Controller to create a new Client SPOC
exports.create = (req, res) => {
  const {
    name,
    designation,
    phone,
    email,
    email1,
    email2,
    email3,
    email4,
    admin_id,
    _token,
  } = req.body;

  // Validate required fields
  const missingFields = [];
  if (!name) missingFields.push("Name");
  if (!designation) missingFields.push("Designation");
  if (!admin_id) missingFields.push("Admin ID");
  if (!_token) missingFields.push("Token");
  if (!phone) missingFields.push("Phone");
  if (!email) missingFields.push("Email");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = JSON.stringify({ client_spoc: "create" });

  // Check admin authorization
  Common.isAdminAuthorizedForAction(admin_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        message: authResult.message,
      });
    }

    // Validate admin token
    Common.isAdminTokenValid(_token, admin_id, (err, tokenResult) => {
      if (err) {
        console.error("Token validation error:", err);
        return res
          .status(500)
          .json({ status: false, message: "Internal server error" });
      }

      if (!tokenResult.status) {
        return res
          .status(401)
          .json({ status: false, message: tokenResult.message });
      }

      const newToken = tokenResult.newToken;

      // List of emails to check
      const emailsToCheck = [email, email1, email2, email3, email4].filter(
        Boolean
      );

      // Function to check each email using checkEmailExists
      const checkEmails = (emails, callback) => {
        const usedEmails = [];
        let checkedCount = 0;

        emails.forEach((email) => {
          ClientSpoc.checkEmailExists(email, (err, emailExists) => {
            checkedCount++;
            if (err) {
              console.error(
                `Error checking email existence for ${email}:`,
                err
              );
              return callback(err);
            }

            if (emailExists) {
              usedEmails.push(email);
            }

            // When all emails are checked
            if (checkedCount === emails.length) {
              callback(null, usedEmails);
            }
          });
        });
      };

      // Check all emails
      checkEmails(emailsToCheck, (err, usedEmails) => {
        if (err) {
          return res.status(500).json({
            status: false,
            message: "Internal server error",
            token: newToken,
          });
        }

        if (usedEmails.length > 0) {
          return res.status(409).json({
            status: false,
            message: `The following emails are already in use: ${usedEmails.join(
              ", "
            )}`,
            token: newToken,
          });
        }

        // Proceed with creating Client SPOC if all emails are available
        ClientSpoc.create(
          name,
          designation,
          phone,
          email,
          email1,
          email2,
          email3,
          email4,
          admin_id,
          (err, result) => {
            if (err) {
              console.error("Database error:", err);
              Common.adminActivityLog(
                admin_id,
                "Client SPOC",
                "Create",
                "0",
                null,
                err,
                () => {}
              );
              return res.status(500).json({
                status: false,
                message: err.message,
                token: newToken,
              });
            }

            Common.adminActivityLog(
              admin_id,
              "Client SPOC",
              "Create",
              "1",
              `{id: ${result.insertId}}`,
              null,
              () => {}
            );

            res.json({
              status: true,
              message: "Client SPOC created successfully",
              client_spocs: result,
              token: newToken,
            });
          }
        );
      });
    });
  });
};

// Controller to list all Billing SPOCs
exports.list = (req, res) => {
  const { admin_id, _token } = req.query;

  let missingFields = [];
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  const action = JSON.stringify({ client_spoc: "view" });
  Common.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }
    Common.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json(err);
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      ClientSpoc.list((err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ status: false, message: err.message, token: newToken });
        }

        res.json({
          status: true,
          message: "Billing SPOCs fetched successfully",
          client_spocs: result,
          totalResults: result.length,
          token: newToken,
        });
      });
    });
  });
};

exports.getClientSpocById = (req, res) => {
  const { id, admin_id, _token } = req.query;
  let missingFields = [];
  if (!id || id === "") missingFields.push("Client SPOC ID");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  const action = JSON.stringify({ client_spoc: "view" });
  Common.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }
    Common.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json(err);
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      ClientSpoc.getClientSpocById(id, (err, currentClientSpoc) => {
        if (err) {
          console.error("Error fetching Client SPOC data:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
            token: newToken,
          });
        }

        if (!currentClientSpoc) {
          return res.status(404).json({
            status: false,
            message: "Client SPOC not found",
            token: newToken,
          });
        }

        res.json({
          status: true,
          message: "Client SPOC retrieved successfully",
          client_spocs: currentClientSpoc,
          token: newToken,
        });
      });
    });
  });
};

// Controller to name a Client SPOC
exports.update = (req, res) => {
  const {
    id,
    name,
    designation,
    phone,
    email,
    email1,
    email2,
    email3,
    email4,
    admin_id,
    _token,
  } = req.body;

  let missingFields = [];
  if (!id || id === "") missingFields.push("Client SPOC ID");
  if (!name || name === "") missingFields.push("Name");
  if (!designation || designation === "") missingFields.push("Description");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");
  if (!phone || phone === "") missingFields.push("Phone");
  if (!email || email === "") missingFields.push("Email");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  const action = JSON.stringify({ client_spoc: "update" });
  Common.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      // Check the status returned by the authorization function
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }
    Common.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json(err);
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      ClientSpoc.getClientSpocById(id, (err, currentClientSpoc) => {
        if (err) {
          console.error("Error fetching Client SPOC data:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
            token: newToken,
          });
        }

        const changes = {};
        if (currentClientSpoc.name !== name) {
          changes.name = {
            old: currentClientSpoc.name,
            new: name,
          };
        }
        if (currentClientSpoc.designation !== designation) {
          changes.designation = {
            old: currentClientSpoc.designation,
            new: designation,
          };
        }

        ClientSpoc.update(
          id,
          name,
          designation,
          phone,
          email,
          email1,
          email2,
          email3,
          email4,
          (err, result) => {
            if (err) {
              console.error("Database error:", err);
              Common.adminActivityLog(
                admin_id,
                "Client SPOC",
                "Update",
                "0",
                JSON.stringify({ id, ...changes }),
                err,
                () => {}
              );
              return res.status(500).json({
                status: false,
                message: err.message,
                token: newToken,
              });
            }

            Common.adminActivityLog(
              admin_id,
              "Client SPOC",
              "Update",
              "1",
              JSON.stringify({ id, ...changes }),
              null,
              () => {}
            );

            res.json({
              status: true,
              message: "Client SPOC named successfully",
              client_spocs: result,
              token: newToken,
            });
          }
        );
      });
    });
  });
};

// Controller to delete a Client SPOC
exports.delete = (req, res) => {
  const { id, admin_id, _token } = req.query;

  let missingFields = [];
  if (!id || id === "") missingFields.push("Client SPOC ID");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  const action = JSON.stringify({ client_spoc: "delete" });
  Common.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      // Check the status returned by the authorization function
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }
    Common.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json(err);
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      ClientSpoc.getClientSpocById(id, (err, currentClientSpoc) => {
        if (err) {
          console.error("Error fetching Client SPOC data:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
            token: newToken,
          });
        }

        ClientSpoc.delete(id, (err, result) => {
          if (err) {
            console.error("Database error:", err);
            Common.adminActivityLog(
              admin_id,
              "Client SPOC",
              "Delete",
              "0",
              JSON.stringify({ id, ...currentClientSpoc }),
              err,
              () => {}
            );
            return res
              .status(500)
              .json({ status: false, message: err.message, token: newToken });
          }

          Common.adminActivityLog(
            admin_id,
            "Client SPOC",
            "Delete",
            "1",
            JSON.stringify(currentClientSpoc),
            null,
            () => {}
          );

          res.json({
            status: true,
            message: "Client SPOC deleted successfully",
            token: newToken,
          });
        });
      });
    });
  });
};

exports.checkEmailExists = (req, res) => {
  const { email, admin_id, _token } = req.body;

  // Validate required fields
  const missingFields = [];
  if (!email) missingFields.push("Email");
  if (!admin_id) missingFields.push("Admin ID");
  if (!_token) missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = JSON.stringify({ client_spoc: "create" });

  // Check admin authorization
  Common.isAdminAuthorizedForAction(admin_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        message: authResult.message,
      });
    }

    // Validate admin token
    Common.isAdminTokenValid(_token, admin_id, (err, tokenResult) => {
      if (err) {
        console.error("Token validation error:", err);
        return res
          .status(500)
          .json({ status: false, message: "Internal server error" });
      }

      if (!tokenResult.status) {
        return res
          .status(401)
          .json({ status: false, message: tokenResult.message });
      }

      const newToken = tokenResult.newToken;

      // Check if the email already exists
      ClientSpoc.checkEmailExists(email, (err, emailExists) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({
            status: false,
            message: "Internal server error",
            token: newToken,
          });
        }

        if (emailExists) {
          return res.status(409).json({
            status: false,
            message: "Email is already in use for another Client SPOC",
            token: newToken,
          });
        }

        return res.status(200).json({
          status: true,
          message: "Email is available for use",
          token: newToken,
        });
      });
    });
  });
};
