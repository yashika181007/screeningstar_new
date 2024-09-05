const Client = require("../../../../models/customer/branch/clientApplicationModel");
const BranchCommon = require("../../../../models/customer/branch/commonModel");
const { sendEmail } = require("../../../../mailer/clientApplicationMailer");

exports.create = (req, res) => {
  const {
    branch_id,
    _token,
    name,
    attach_documents,
    employee_id,
    spoc,
    location,
    batch_number,
    sub_client,
    photo,
    services,
    package,
  } = req.body;

  // Define required fields
  const requiredFields = {
    branch_id,
    _token,
    name,
    attach_documents,
    employee_id,
    spoc,
    location,
    batch_number,
    sub_client,
    photo,
  };

  // Check for missing fields
  const missingFields = Object.keys(requiredFields)
    .filter((field) => !requiredFields[field] || requiredFields[field] === "")
    .map((field) => field.replace(/_/g, " "));

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = JSON.stringify({ client_application: "create" });

  // Check branch authorization
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message,
      });
    }

    // Validate branch token
    BranchCommon.isBranchTokenValid(_token, branch_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      // Check if employee ID is unique
      Client.checkUniqueEmpId(employee_id, (err, exists) => {
        if (err) {
          console.error("Error checking unique ID:", err);
          return res
            .status(500)
            .json({ status: false, message: err.message, token: newToken });
        }

        if (exists) {
          return res.status(400).json({
            status: false,
            message: `Client Employee ID '${employee_id}' already exists.`,
            token: newToken,
          });
        }

        // Create client application
        Client.create(
          {
            name,
            attach_documents,
            employee_id,
            spoc,
            location,
            batch_number,
            sub_client,
            photo,
            branch_id,
            services,
            package,
          },
          (err, result) => {
            if (err) {
              console.error(
                "Database error during client application creation:",
                err
              );
              BranchCommon.branchActivityLog(
                branch_id,
                "Client Application",
                "Create",
                "0",
                null,
                err.message,
                () => {}
              );
              return res.status(500).json({
                status: false,
                message:
                  "Failed to create client application. Please try again.",
                token: newToken,
              });
            }

            BranchCommon.branchActivityLog(
              branch_id,
              "Client Application",
              "Create",
              "1",
              `{id: ${result.insertId}}`,
              null,
              () => {}
            );

            // Fetch branch and customer emails for notification
            BranchCommon.getBranchandCustomerEmailsForNotification(
              branch_id,
              (emailError, emailData) => {
                if (emailError) {
                  console.error("Error fetching emails:", emailError);
                  return res.status(500).json({
                    status: false,
                    message: "Failed to retrieve email addresses.",
                    token: newToken,
                  });
                }

                const { branch, customer } = emailData;

                // Prepare recipient and CC lists
                const toArr = [{ name: branch.name, email: branch.email }];
                const ccArr = customer.emails
                  .split(",")
                  .map((email) => ({
                    name: customer.name,
                    email: email.trim(),
                  }));

                // Send email notification
                sendEmail(
                  "candidate application",
                  "create",
                  services, // Pass services array
                  toArr,
                  ccArr
                )
                  .then(() => {
                    res.status(201).json({
                      status: true,
                      message:
                        "Client application created successfully and email sent.",
                      data: {
                        client: result,
                        package,
                      },
                      token: newToken,
                      toArr,
                      ccArr
                    });
                  })
                  .catch((emailError) => {
                    console.error("Error sending email:", emailError);
                    res.status(201).json({
                      status: true,
                      message:
                        "Client application created successfully, but failed to send email.",
                      client: result,
                      token: newToken,
                    });
                  });
              }
            );
          }
        );
      });
    });
  });
};

// Controller to list all clientApplications
exports.list = (req, res) => {
  const { branch_id, _token } = req.query;

  let missingFields = [];
  if (!branch_id) missingFields.push("Branch ID");
  if (!_token) missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = JSON.stringify({ client_application: "view" });
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify branch token
    BranchCommon.isBranchTokenValid(_token, branch_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Client.list(branch_id, (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({
            status: false,
            message: "An error occurred while fetching client applications.",
            token: newToken,
          });
        }

        res.json({
          status: true,
          message: "Client applications fetched successfully.",
          clientApplications: result,
          totalResults: result.length,
          token: newToken,
        });
      });
    });
  });
};

exports.update = (req, res) => {
  const {
    branch_id,
    _token,
    client_application_id,
    name,
    attach_documents,
    employee_id,
    spoc,
    location,
    batch_number,
    sub_client,
    photo,
    services,
    package,
  } = req.body;

  // Define required fields
  const requiredFields = {
    branch_id,
    _token,
    client_application_id,
    name,
    attach_documents,
    employee_id,
    spoc,
    location,
    batch_number,
    sub_client,
    photo,
  };

  // Check for missing fields
  const missingFields = Object.keys(requiredFields)
    .filter((field) => !requiredFields[field] || requiredFields[field] === "")
    .map((field) => field.replace(/_/g, " "));

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = JSON.stringify({ client_application: "update" });
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message,
      });
    }

    BranchCommon.isBranchTokenValid(_token, branch_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      // Fetch the current clientApplication
      Client.getClientApplicationById(
        client_application_id,
        (err, currentClientApplication) => {
          if (err) {
            console.error(
              "Database error during clientApplication retrieval:",
              err
            );
            return res.status(500).json({
              status: false,
              message: "Failed to retrieve Client. Please try again.",
              token: newToken,
            });
          }

          if (!currentClientApplication) {
            return res.status(404).json({
              status: false,
              message: "Client Aplication not found.",
              token: newToken,
            });
          }

          const changes = {};
          if (currentClientApplication.name !== name) {
            changes.name = { old: currentClientApplication.name, new: name };
          }
          if (currentClientApplication.attach_documents !== attach_documents) {
            changes.attach_documents = {
              old: currentClientApplication.attach_documents,
              new: attach_documents,
            };
          }
          if (currentClientApplication.employee_id !== employee_id) {
            changes.employee_id = {
              old: currentClientApplication.employee_id,
              new: employee_id,
            };
          }
          if (currentClientApplication.spoc !== spoc) {
            changes.spoc = {
              old: currentClientApplication.spoc,
              new: spoc,
            };
          }
          if (currentClientApplication.location !== location) {
            changes.location = {
              old: currentClientApplication.location,
              new: location,
            };
          }
          if (currentClientApplication.batch_number !== batch_number) {
            changes.batch_number = {
              old: currentClientApplication.batch_number,
              new: batch_number,
            };
          }
          if (currentClientApplication.sub_client !== sub_client) {
            changes.sub_client = {
              old: currentClientApplication.sub_client,
              new: sub_client,
            };
          }
          if (currentClientApplication.photo !== photo) {
            changes.photo = {
              old: currentClientApplication.photo,
              new: photo,
            };
          }
          if (
            services !== "" &&
            currentClientApplication.services !== services
          ) {
            changes.services = {
              old: currentClientApplication.services,
              new: services,
            };
          }
          if (package !== "" && currentClientApplication.package !== package) {
            changes.package = {
              old: currentClientApplication.package,
              new: package,
            };
          }
          Client.checkUniqueEmpIdByClientApplicationID(
            employee_id,
            client_application_id,
            (err, exists) => {
              if (err) {
                console.error("Error checking unique ID:", err);
                return res.status(500).json({
                  status: false,
                  message: err.message,
                  token: newToken,
                });
              }

              if (
                exists &&
                exists.client_application_id !== client_application_id
              ) {
                return res.status(400).json({
                  status: false,
                  message: `Client Employee ID '${employee_id}' already exists.`,
                  token: newToken,
                });
              }

              Client.update(
                {
                  name,
                  attach_documents,
                  employee_id,
                  spoc,
                  location,
                  batch_number,
                  sub_client,
                  photo,
                  services,
                  package,
                },
                client_application_id,
                (err, result) => {
                  if (err) {
                    console.error(
                      "Database error during client application update:",
                      err
                    );
                    BranchCommon.branchActivityLog(
                      branch_id,
                      "Client Application",
                      "Update",
                      "0",
                      JSON.stringify({ client_application_id, ...changes }),
                      err.message,
                      () => {}
                    );
                    return res.status(500).json({
                      status: false,
                      message: err.message,
                      token: newToken,
                    });
                  }

                  BranchCommon.branchActivityLog(
                    branch_id,
                    "Client Application",
                    "Update",
                    "1",
                    JSON.stringify({ client_application_id, ...changes }),
                    null,
                    () => {}
                  );

                  res.status(200).json({
                    status: true,
                    message: "Client application updated successfully.",
                    package: result,
                    token: newToken,
                  });
                }
              );
            }
          );
        }
      );
    });
  });
};

exports.delete = (req, res) => {
  const { id, branch_id, _token } = req.query;

  // Validate required fields
  const missingFields = [];
  if (!id) missingFields.push("Client Application ID");
  if (!branch_id) missingFields.push("Branch ID");
  if (!_token) missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = JSON.stringify({ client_application: "delete" });

  // Check branch authorization
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (result) => {
    if (!result.status) {
      // Check the status returned by the authorization function
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Validate branch token
    BranchCommon.isBranchTokenValid(
      _token,
      branch_id,
      (err, tokenValidationResult) => {
        if (err) {
          console.error("Token validation error:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
          });
        }

        if (!tokenValidationResult.status) {
          return res.status(401).json({
            status: false,
            message: tokenValidationResult.message,
          });
        }

        const newToken = tokenValidationResult.newToken;

        // Fetch the current clientApplication
        Client.getClientApplicationById(id, (err, currentClientApplication) => {
          if (err) {
            console.error(
              "Database error during clientApplication retrieval:",
              err
            );
            return res.status(500).json({
              status: false,
              message: "Failed to retrieve Client. Please try again.",
              token: newToken,
            });
          }

          if (!currentClientApplication) {
            return res.status(404).json({
              status: false,
              message: "Client Aplication not found.",
              token: newToken,
            });
          }

          // Delete the clientApplication
          Client.delete(id, (err, result) => {
            if (err) {
              console.error(
                "Database error during clientApplication deletion:",
                err
              );
              BranchCommon.branchActivityLog(
                branch_id,
                "Client Application",
                "Delete",
                "0",
                JSON.stringify({ id }),
                err.message,
                () => {}
              );
              return res.status(500).json({
                status: false,
                message: "Failed to delete Client. Please try again.",
                token: newToken,
              });
            }

            BranchCommon.branchActivityLog(
              branch_id,
              "Client Application",
              "Delete",
              "1",
              JSON.stringify({ id }),
              null,
              () => {}
            );

            res.status(200).json({
              status: true,
              message: "Client Application deleted successfully.",
              result,
              token: newToken,
            });
          });
        });
      }
    );
  });
};
