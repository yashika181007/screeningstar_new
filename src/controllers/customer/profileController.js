const crypto = require("crypto");
const Customer = require("../../models/customer/customerModel");
const Branch = require("../../models/customer/branch/branchModel");
const AdminCommon = require("../../models/admin/commonModel");
const BranchCommon = require("../../models/customer/branch/commonModel");
const { createMail } = require("../../mailer/customer/createMail");

const fs = require("fs");
const path = require("path");
const { upload, saveImage, saveImages } = require("../../utils/imageSave");

// Helper function to generate a password
const generatePassword = (companyName) => {
  const firstName = companyName.split(" ")[0];
  return `${firstName}@123`;
};

const areEmailsUsed = (emails) => {
  return new Promise((resolve, reject) => {
    // Validate inputs
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return reject(new Error("Missing required field: Emails"));
    }

    // Check each email
    const emailCheckPromises = emails.map((email) => {
      return new Promise((resolve, reject) => {
        Branch.isEmailUsed(email, (err, isUsed) => {
          if (err) {
            return reject(err);
          }
          resolve({ email, isUsed });
        });
      });
    });

    // Wait for all email checks to complete
    Promise.all(emailCheckPromises)
      .then((results) => {
        // Filter out emails that are in use
        const usedEmails = results
          .filter((result) => result.isUsed)
          .map((result) => result.email);

        // Determine if any emails are used
        const areAnyUsed = usedEmails.length > 0;

        // Create the response message if any emails are used
        let message = "";
        if (areAnyUsed) {
          const emailCount = usedEmails.length;

          if (emailCount === 1) {
            message = `${usedEmails[0]} is already used.`;
          } else if (emailCount === 2) {
            message = `${usedEmails[0]} and ${usedEmails[1]} are already used.`;
          } else {
            const lastEmail = usedEmails.pop(); // Remove the last email for formatting
            message = `${usedEmails.join(
              ", "
            )} and ${lastEmail} are already used.`;
          }
        }

        // Resolve with a boolean and the message
        resolve({ areAnyUsed, message });
      })
      .catch((err) => {
        console.error("Error checking email usage:", err);
        reject(new Error("Error checking email usage: " + err.message));
      });
  });
};

exports.create = (req, res) => {
  const {
    admin_id,
    _token,
    tat,
    state,
    gstin,
    emails,
    address,
    username,
    branches,
    state_code,
    clientData,
    client_spoc,
    client_code,
    company_name,
    mobile_number,
    contact_person,
    date_agreement,
    client_standard,
    additional_login,
    agreement_period,
    name_of_escalation,
    custom_template,
    custom_address,
    send_mail,
  } = req.body;

  // Define required fields
  const requiredFields = {
    admin_id,
    _token,
    tat,
    state,
    gstin,
    emails,
    address,
    branches,
    state_code,
    clientData,
    client_spoc,
    client_code,
    company_name,
    mobile_number,
    contact_person,
    date_agreement,
    client_standard,
    additional_login,
    agreement_period,
    name_of_escalation,
    custom_template,
  };

  let additional_login_int = 0;
  if (additional_login && additional_login.toLowerCase() === "yes") {
    additional_login_int = 1;
    requiredFields.username = username;
  }

  if (custom_template && custom_template.toLowerCase() === "yes") {
    requiredFields.custom_address = custom_address;
  }

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

  const action = JSON.stringify({ customer: "create" });
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const allEmails = emails.concat(
        branches.map((branch) => branch.branch_email)
      );
      areEmailsUsed(allEmails)
        .then(({ areAnyUsed, message }) => {
          if (areAnyUsed) {
            return res.status(400).json({
              status: false,
              message: message, // Return the formatted message in the response
              token: result.newToken,
            });
          }
          const newToken = result.newToken;
          const password = generatePassword(company_name);

          // Check if client_unique_id already exists
          Customer.checkUniqueId(client_code, (err, exists) => {
            if (err) {
              console.error("Error checking unique ID:", err);
              return res.status(500).json({
                status: false,
                message: "Internal server error",
                token: newToken,
              });
            }

            if (exists) {
              return res.status(400).json({
                status: false,
                message: `Client Unique ID '${client_code}' already exists.`,
                token: newToken,
              });
            }

            // Check if username is required and exists
            if (additional_login && additional_login.toLowerCase() === "yes") {
              Customer.checkUsername(username, (err, exists) => {
                if (err) {
                  console.error("Error checking username:", err);
                  return res.status(500).json({
                    status: false,
                    message: "Internal server error",
                    token: newToken,
                  });
                }

                if (exists) {
                  return res.status(400).json({
                    status: false,
                    message: `Username '${username}' already exists.`,
                    token: newToken,
                  });
                }

                // Create new customer record
                createCustomerRecord();
              });
            } else {
              // Create new customer record
              createCustomerRecord();
            }
          });

          function createCustomerRecord() {
            Customer.create(
              {
                admin_id,
                client_unique_id: client_code,
                name: company_name,
                address,
                profile_picture: null,
                emails_json: JSON.stringify(emails),
                mobile_number,
                services: JSON.stringify(clientData),
                additional_login: additional_login_int,
                username:
                  additional_login && additional_login.toLowerCase() === "yes"
                    ? username
                    : null,
              },
              (err, result) => {
                if (err) {
                  console.error("Database error while creating customer:", err);
                  AdminCommon.adminActivityLog(
                    admin_id,
                    "Customer",
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

                const customerId = result.insertId;

                Customer.createCustomerMeta(
                  {
                    customer_id: customerId,
                    address,
                    contact_person_name: contact_person,
                    escalation_point_contact: name_of_escalation,
                    single_point_of_contact: client_spoc,
                    gst_number: gstin,
                    tat_days: tat,
                    agreement_date: date_agreement,
                    agreement_duration: agreement_period,
                    custom_template,
                    custom_address:
                      custom_template && custom_template.toLowerCase() === "yes"
                        ? custom_address
                        : null,
                    state,
                    state_code,
                    payment_contact_person: null,
                    client_standard,
                  },
                  (err, metaResult) => {
                    if (err) {
                      console.error(
                        "Database error while creating customer meta:",
                        err
                      );
                      AdminCommon.adminActivityLog(
                        admin_id,
                        "Customer Meta",
                        "Create",
                        "0",
                        `{id: ${customerId}}`,
                        err,
                        () => {}
                      );
                      return res.status(500).json({
                        status: false,
                        message: err.error,
                        token: newToken,
                      });
                    }
                    const headBranchEmail = emails[0];
                    // Create the first branch (head branch)
                    Branch.create(
                      {
                        customer_id: customerId,
                        name: company_name,
                        email: headBranchEmail,
                        head: 1,
                        password,
                        mobile_number,
                      },
                      (err, headBranchResult) => {
                        if (err) {
                          console.error("Error creating head branch:", err);
                          return res.status(500).json({
                            status: false,
                            message: err.message,
                            token: newToken,
                          });
                        }

                        const headBranchId = headBranchResult.insertId;

                        // Create remaining branches with head_branch_id as foreign key
                        const branchCreationPromises = branches.map(
                          (branch) => {
                            return new Promise((resolve, reject) => {
                              Branch.create(
                                {
                                  customer_id: customerId,
                                  name: branch.branch_name,
                                  email: branch.branch_email,
                                  head: 0,
                                  head_id: headBranchId,
                                  password,
                                },
                                (err, branchResult) => {
                                  if (err) {
                                    console.error(
                                      "Error creating branch:",
                                      branch.branch_name,
                                      err
                                    );
                                    return reject(err);
                                  }
                                  resolve(branchResult);
                                }
                              );
                            });
                          }
                        );

                        Promise.all(branchCreationPromises)
                          .then((branchResults) => {
                            AdminCommon.adminActivityLog(
                              admin_id,
                              "Customer",
                              "Create",
                              "1",
                              `{id: ${customerId}}`,
                              null,
                              () => {}
                            );

                            if (send_mail == 1) {
                              Customer.getAllBranchesByCustomerId(
                                customerId,
                                (err, dbBranches) => {
                                  if (err) {
                                    console.error(
                                      "Database error while fetching branches:",
                                      err
                                    );

                                    // Log the error using your admin activity log function
                                    AdminCommon.adminActivityLog(
                                      admin_id,
                                      "Branch",
                                      "Fetch",
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

                                  const formattedBranches = dbBranches.map(
                                    (dbBranch) => ({
                                      email: dbBranch.email,
                                      name: dbBranch.name,
                                    })
                                  );

                                  const emailPromises = dbBranches.map(
                                    (dbBranch) => {
                                      if (dbBranch.is_head == 1) {
                                        // For head branches, fetch customer details
                                        return new Promise(
                                          (resolve, reject) => {
                                            Customer.getCustomerById(
                                              customerId,
                                              (err, currentCustomer) => {
                                                if (err) {
                                                  console.error(
                                                    "Database error during customer retrieval:",
                                                    err
                                                  );
                                                  return reject(
                                                    new Error(
                                                      "Failed to retrieve Customer. Please try again."
                                                    )
                                                  );
                                                }

                                                if (!currentCustomer) {
                                                  return reject(
                                                    new Error(
                                                      "Customer not found."
                                                    )
                                                  );
                                                }

                                                const customerName =
                                                  currentCustomer.name;
                                                const customerJsonArr =
                                                  JSON.parse(
                                                    currentCustomer.emails
                                                  );

                                                // Create a recipient list
                                                const customerRecipientList =
                                                  customerJsonArr.map(
                                                    (email) => ({
                                                      name: customerName,
                                                      email: email,
                                                    })
                                                  );

                                                // Create email for head branch
                                                createMail(
                                                  "customer",
                                                  "create",
                                                  company_name,
                                                  formattedBranches,
                                                  password,
                                                  dbBranch.is_head,
                                                  customerRecipientList
                                                )
                                                  .then(resolve)
                                                  .catch(reject);
                                              }
                                            );
                                          }
                                        );
                                      } else {
                                        // For non-head branches
                                        return createMail(
                                          "customer",
                                          "create",
                                          company_name,
                                          [
                                            {
                                              email: dbBranch.email,
                                              name: dbBranch.name,
                                            },
                                          ],
                                          password,
                                          dbBranch.is_head,
                                          []
                                        ).catch((emailError) => {
                                          console.error(
                                            "Error sending email:",
                                            emailError
                                          );
                                          return Promise.resolve(
                                            "Email sending failed for this branch."
                                          );
                                        });
                                      }
                                    }
                                  );

                                  // Wait for all email promises to resolve
                                  Promise.all(emailPromises)
                                    .then(() => {
                                      return res.json({
                                        status: true,
                                        message:
                                          "Customer and branches created successfully.",
                                        branches: formattedBranches,
                                        data: { customerId },
                                        password,
                                        token: newToken,
                                      });
                                    })
                                    .catch((error) => {
                                      console.error(
                                        "An error occurred during processing:",
                                        error
                                      );
                                      return res.status(500).json({
                                        status: false,
                                        message:
                                          "An error occurred while processing requests.",
                                        token: newToken,
                                      });
                                    });
                                }
                              );
                            } else {
                              return res.json({
                                status: true,
                                message:
                                  "Customer and branches created successfully.",
                                token: newToken,
                                data: { customerId },
                                password,
                              });
                            }
                          })
                          .catch((error) => {
                            console.error("Error creating branches:", error);
                            return res.status(500).json({
                              status: false,
                              message: "Error creating some branches.",
                              token: newToken,
                            });
                          });
                      }
                    );
                  }
                );
              }
            );
          }
        })
        .catch((err) => {
          console.error(err);
          return res.status(500).json({
            status: false,
            message: "An error occurred while checking email usage.",
          });
        });
    });
  });
};

exports.upload = async (req, res) => {
  // Use multer to handle the upload
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({
        status: false,
        message: "Error uploading file.",
      });
    }

    try {
      const {
        admin_id,
        _token,
        customer_code,
        customer_id,
        upload_category,
        send_mail,
        company_name,
        password,
      } = req.body;

      // Validate required fields and collect missing ones
      const requiredFields = {
        admin_id,
        _token,
        customer_code,
        customer_id,
        upload_category,
      };

      // Check for missing fields
      const missingFields = Object.keys(requiredFields)
        .filter(
          (field) =>
            !requiredFields[field] ||
            requiredFields[field] === "" ||
            requiredFields[field] == "undefined" ||
            requiredFields[field] == undefined
        )
        .map((field) => field.replace(/_/g, " "));

      if (missingFields.length > 0) {
        return res.status(400).json({
          status: false,
          message: `Missing required fields: ${missingFields.join(", ")}`,
        });
      }

      // If send_mail is 1, add additional required fields
      if (send_mail == 1) {
        requiredFields.company_name = company_name;
        requiredFields.password = password;
      }

      // Check if the admin is authorized
      const action = JSON.stringify({ customer: "create" });
      AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
        if (!result.status) {
          console.warn("Admin not authorized:", result.message);
          return res.status(403).json({
            status: false,
            message: result.message,
          });
        }

        // Verify admin token
        AdminCommon.isAdminTokenValid(_token, admin_id, async (err, result) => {
          if (err) {
            console.error("Error checking token validity:", err);
            return res
              .status(500)
              .json({ status: false, message: err.message });
          }

          if (!result.status) {
            console.warn("Invalid admin token:", result.message);
            return res
              .status(401)
              .json({ status: false, message: result.message });
          }

          const newToken = result.newToken;

          // Define the target directory for uploads
          let targetDir;
          let db_column;
          switch (upload_category) {
            case "custom_logo":
              targetDir = `uploads/customer/${customer_code}/logo`;
              db_column = `custom_logo`;
              break;
            case "agr_upload":
              targetDir = `uploads/customer/${customer_code}/agreement`;
              db_column = `agreement`;
              break;
            default:
              return res.status(400).json({
                status: false,
                message: "Invalid upload category.",
                token: newToken,
              });
          }

          try {
            // Create the target directory for uploads
            await fs.promises.mkdir(targetDir, { recursive: true });

            let savedImagePaths = [];

            // Check for multiple files under the "images" field
            if (req.files.images) {
              savedImagePaths = await saveImages(req.files.images, targetDir);
            }

            // Check for a single file under the "image" field
            if (req.files.image && req.files.image.length > 0) {
              const savedImagePath = await saveImage(
                req.files.image[0],
                targetDir
              );
              savedImagePaths.push(savedImagePath);
            }
            Customer.documentUpload(
              customer_id,
              db_column,
              savedImagePaths,
              (err, result) => {
                if (err) {
                  console.error("Database error while creating customer:", err);
                  AdminCommon.adminActivityLog(
                    admin_id,
                    "Customer",
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

                if (send_mail == 1) {
                  Customer.getAllBranchesByCustomerId(
                    customer_id,
                    (err, dbBranches) => {
                      if (err) {
                        console.error(
                          "Database error while fetching branches:",
                          err
                        );

                        // Log the error using your admin activity log function
                        AdminCommon.adminActivityLog(
                          admin_id, // Assuming admin_id is defined in your context
                          "Branch",
                          "Fetch",
                          "0",
                          null,
                          err,
                          () => {} // Callback after logging the error
                        );

                        // Return error response
                        return res.status(500).json({
                          status: false,
                          message: err.message,
                          token: newToken, // Assuming newToken is defined in your context
                        });
                      }

                      // Create an array to hold all promises
                      const emailPromises = [];

                      // Format the branches into the desired structure
                      const formattedBranches = dbBranches.map((dbBranch) => ({
                        email: dbBranch.email,
                        name: dbBranch.name,
                      }));

                      // Iterate through each branch
                      dbBranches.forEach((dbBranch) => {
                        // Check if the branch is a head branch
                        if (dbBranch.is_head == 1) {
                          Customer.getCustomerById(
                            customer_id,
                            (err, currentCustomer) => {
                              if (err) {
                                console.error(
                                  "Database error during customer retrieval:",
                                  err
                                );
                                return res.status(500).json({
                                  status: false,
                                  message:
                                    "Failed to retrieve Customer. Please try again.",
                                  token: newToken,
                                });
                              }

                              if (!currentCustomer) {
                                return res.status(404).json({
                                  status: false,
                                  message: "Customer not found.",
                                  token: newToken,
                                });
                              }
                              const customerName = currentCustomer.name;
                              const customerJsonArr = JSON.parse(
                                currentCustomer.emails
                              );
                              // Create a recipient list
                              const customerRecipientList = customerJsonArr
                                .map((email) => `"${customerName}" <${email}>`)
                                .join(", ");
                              // Send email with all formatted branches
                              const emailPromise = createMail(
                                "customer",
                                "create",
                                company_name,
                                formattedBranches,
                                password,
                                dbBranch.is_head,
                                customerRecipientList
                              ).catch((emailError) => {
                                console.error(
                                  "Error sending email:",
                                  emailError
                                );
                                return Promise.resolve(
                                  "Email sending failed for this branch."
                                );
                              });

                              emailPromises.push(emailPromise);
                            }
                          );
                        } else {
                          // Send email with the single formatted branch
                          const emailPromise = createMail(
                            "customer",
                            "create",
                            company_name,
                            [{ email: dbBranch.email, name: dbBranch.name }], // Send only the current branch
                            password,
                            dbBranch.is_head,
                            []
                          ).catch((emailError) => {
                            console.error("Error sending email:", emailError);
                            return Promise.resolve(
                              "Email sending failed for this branch."
                            );
                          });

                          emailPromises.push(emailPromise);
                        }
                      });

                      // Wait for all email promises to resolve
                      Promise.all(emailPromises)
                        .then(() => {
                          return res.json({
                            status: true,
                            message:
                              "Customer and branches created successfully.",
                            branches: formattedBranches, // Optionally send the formatted branches
                            data: savedImagePaths,
                            token: newToken,
                          });
                        })
                        .catch((error) => {
                          console.error(
                            "An error occurred during processing:",
                            error
                          );
                          return res.status(500).json({
                            status: false,
                            message:
                              "An error occurred while processing requests.",
                            token: newToken,
                          });
                        });
                    }
                  );
                } else {
                  return res.json({
                    status: true,
                    message:
                      "Customer and branches created and file saved successfully.",
                    data: savedImagePaths,
                    token: newToken,
                  });
                }
              }
            );
          } catch (error) {
            console.error("Error saving image:", error);
            return res.status(500).json({
              status: false,
              message: "An error occurred while saving the image.",
              token: newToken,
            });
          }
        });
      });
    } catch (error) {
      console.error("Error processing upload:", error);
      return res.status(500).json({
        status: false,
        message: "An error occurred during the upload process.",
      });
    }
  });
};

// Controller to list all customers
exports.inactiveList = (req, res) => {
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

  const action = JSON.stringify({ customer: "view" });
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Customer.inactiveList((err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ status: false, message: err.message, token: newToken });
        }

        res.json({
          status: true,
          message: "Customers fetched successfully",
          customers: result,
          totalResults: result.length,
          token: newToken,
        });
      });
    });
  });
};

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

  const action = JSON.stringify({ customer: "view" });
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Customer.list((err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ status: false, message: err.message, token: newToken });
        }

        res.json({
          status: true,
          message: "Customers fetched successfully",
          customers: result,
          totalResults: result.length,
          token: newToken,
        });
      });
    });
  });
};

exports.update = (req, res) => {
  const {
    admin_id,
    _token,
    customer_id,
    tat,
    state,
    gstin,
    emails,
    address,
    username,
    state_code,
    services,
    client_spoc,
    client_code,
    company_name,
    mobile_number,
    contact_person,
    date_agreement,
    client_standard,
    additional_login,
    agreement_period,
    name_of_escalation,
    custom_template,
    custom_address,
  } = req.body;

  // Define required fields
  const requiredFields = {
    admin_id,
    _token,
    customer_id,
    tat,
    state,
    gstin,
    emails,
    address,
    state_code,
    client_spoc,
    client_code,
    company_name,
    mobile_number,
    contact_person,
    date_agreement,
    client_standard,
    additional_login,
    agreement_period,
    name_of_escalation,
    custom_template,
  };

  let additional_login_int = 0;
  if (additional_login && additional_login.toLowerCase() === "yes") {
    additional_login_int = 1;
    requiredFields.username = username;
  }

  if (custom_template && custom_template.toLowerCase() === "yes") {
    requiredFields.custom_address = custom_address;
  }

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
  const clientData = services;

  const action = JSON.stringify({ customer: "update" });

  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message,
      });
    }

    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Customer.getCustomerById(customer_id, (err, currentCustomer) => {
        if (err) {
          console.error("Database error during customer retrieval:", err);
          return res.status(500).json({
            status: false,
            message: "Failed to retrieve Customer. Please try again.",
            token: newToken,
          });
        }

        if (!currentCustomer) {
          return res.status(404).json({
            status: false,
            message: "Customer not found.",
            token: newToken,
          });
        }

        const changes = {};
        const compareAndAddChanges = (key, newValue) => {
          if (currentCustomer[key] !== newValue) {
            changes[key] = {
              old: currentCustomer[key],
              new: newValue,
            };
          }
        };

        compareAndAddChanges("name", company_name);
        compareAndAddChanges("emails_json", JSON.stringify(emails));
        compareAndAddChanges("client_unique_id", client_code);
        compareAndAddChanges("additional_login", additional_login_int);
        if (additional_login && additional_login.toLowerCase() === "yes") {
          compareAndAddChanges("username", username);
        }
        compareAndAddChanges("mobile", mobile_number);
        compareAndAddChanges("services", JSON.stringify(clientData));

        Customer.getCustomerMetaById(
          customer_id,
          (err, currentCustomerMeta) => {
            if (err) {
              console.error(
                "Database error during customer meta retrieval:",
                err
              );
              return res.status(500).json({
                status: false,
                message: "Failed to retrieve Customer meta. Please try again.",
                token: newToken,
              });
            }

            if (currentCustomerMeta) {
              compareAndAddChanges("address", address);
              compareAndAddChanges("contact_person_name", contact_person);
              compareAndAddChanges(
                "escalation_point_contact",
                name_of_escalation
              );
              compareAndAddChanges("single_point_of_contact", client_spoc);
              compareAndAddChanges("gst_number", gstin);
              compareAndAddChanges("tat_days", tat);
              compareAndAddChanges("agreement_date", date_agreement);
              compareAndAddChanges("client_standard", client_standard);
              compareAndAddChanges("agreement_duration", agreement_period);
              compareAndAddChanges("custom_template", custom_template);
              if (custom_template && custom_template.toLowerCase() === "yes") {
                compareAndAddChanges("custom_address", custom_address);
              }
              compareAndAddChanges("state", state);
              compareAndAddChanges("state_code", state_code);
              if (currentCustomerMeta.payment_contact_person !== null) {
                changes.payment_contact_person = {
                  old: currentCustomerMeta.payment_contact_person,
                  new: null,
                };
              }
            }

            if (client_code !== currentCustomer.client_code) {
              Customer.checkUniqueIdForUpdate(
                customer_id,
                client_code,
                (err, exists) => {
                  if (err) {
                    console.error("Error checking unique ID:", err);
                    return res.status(500).json({
                      status: false,
                      message: "Internal server error",
                      token: newToken,
                    });
                  }

                  if (exists) {
                    return res.status(400).json({
                      status: false,
                      message: `Client Unique ID '${client_code}' already exists.`,
                      token: newToken,
                    });
                  }

                  continueUpdate();
                }
              );
            } else {
              continueUpdate();
            }

            function continueUpdate() {
              if (
                additional_login &&
                additional_login.toLowerCase() === "yes" &&
                username !== currentCustomer.username
              ) {
                Customer.checkUsernameForUpdate(
                  customer_id,
                  username,
                  (err, exists) => {
                    if (err) {
                      console.error("Error checking username:", err);
                      return res.status(500).json({
                        status: false,
                        message: "Internal server error",
                        token: newToken,
                      });
                    }

                    if (exists) {
                      return res.status(400).json({
                        status: false,
                        message: `Username '${username}' already exists.`,
                        token: newToken,
                      });
                    }

                    updateCustomerRecord();
                  }
                );
              } else {
                updateCustomerRecord();
              }
            }

            function updateCustomerRecord() {
              Customer.update(
                customer_id,
                {
                  admin_id,
                  client_unique_id: client_code,
                  name: company_name,
                  address,
                  profile_picture: currentCustomer.profile_picture,
                  emails_json: emails,
                  mobile: mobile_number,
                  services: JSON.stringify(clientData),
                  additional_login: additional_login_int,
                  username:
                    additional_login && additional_login.toLowerCase() === "yes"
                      ? username
                      : null,
                },
                (err, result) => {
                  if (err) {
                    console.error(
                      "Database error during customer update:",
                      err
                    );
                    return res.status(500).json({
                      status: false,
                      message: "Failed to update customer. Please try again.",
                      token: newToken,
                    });
                  }

                  if (result) {
                    const updatedFields = Object.keys(changes).map((field) => ({
                      field,
                      old_value: changes[field].old,
                      new_value: changes[field].new,
                    }));

                    Customer.updateCustomerMetaByCustomerId(
                      customer_id,
                      {
                        address,
                        contact_person_name: contact_person,
                        escalation_point_contact: name_of_escalation,
                        single_point_of_contact: client_spoc,
                        gst_number: gstin,
                        tat_days: tat,
                        agreement_date: date_agreement,
                        agreement_duration: agreement_period,
                        custom_template:
                          custom_template &&
                          custom_template.toLowerCase() === "yes"
                            ? 1
                            : 0,
                        custom_address:
                          custom_template &&
                          custom_template.toLowerCase() === "yes"
                            ? custom_address
                            : null,
                        state,
                        state_code,
                        payment_contact_person: null,
                        client_standard,
                      },
                      (err, metaResult) => {
                        if (err) {
                          console.error(
                            "Database error during customer meta update:",
                            err
                          );
                          return res.status(500).json({
                            status: false,
                            message:
                              "Failed to update customer meta. Please try again.",
                            token: newToken,
                          });
                        }

                        if (metaResult) {
                          const headBranchEmail = JSON.parse(emails)[0];
                          Branch.updateHeadBranchEmail(
                            customer_id,
                            company_name,
                            headBranchEmail,
                            (err, headBranchResult) => {
                              if (err) {
                                console.error(
                                  "Error updating head branch email:",
                                  err
                                );
                                return res.status(500).json({
                                  status: false,
                                  message:
                                    "Internal server error while updating head branch email.",
                                  token: newToken,
                                });
                              }
                              return res.status(200).json({
                                status: true,
                                message: "Customer updated successfully.",
                                token: newToken,
                              });
                            }
                          );
                        }
                      }
                    );
                  }
                }
              );
            }
          }
        );
      });
    });
  });
};

// Controller to list all customers
exports.fetchBranchPassword = (req, res) => {
  const { admin_id, _token, branch_email } = req.query;

  let missingFields = [];
  if (!branch_email || branch_email === "") missingFields.push("Branch Email");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = JSON.stringify({ branch: "view" });
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message,
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Customer.fetchBranchPasswordByEmail(branch_email, (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ status: false, message: err.message, token: newToken });
        }

        if (!result) {
          return res.status(404).json({
            status: false,
            message: "Password not found",
            token: newToken,
          });
        }

        res.json({
          status: true,
          message: "Password fetched successfully",
          password: result,
          token: newToken,
        });
      });
    });
  });
};

exports.active = (req, res) => {
  const { customer_id, admin_id, _token } = req.query;

  // Define required fields
  const requiredFields = {
    customer_id,
    admin_id,
    _token,
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

  const action = JSON.stringify({ customer: "status" });

  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message,
      });
    }

    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Customer.getCustomerById(customer_id, (err, currentCustomer) => {
        if (err) {
          console.error("Database error during customer retrieval:", err);
          return res.status(500).json({
            status: false,
            message: "Failed to retrieve Customer. Please try again.",
            token: newToken,
          });
        }

        if (!currentCustomer) {
          return res.status(404).json({
            status: false,
            message: "Customer not found.",
            token: newToken,
          });
        }

        const changes = {};
        if (currentCustomer.status !== 1) {
          changes.status = { old: currentCustomer.status, new: 1 };
        }
        // Update the branch
        Customer.active(customer_id, (err, result) => {
          if (err) {
            console.error("Database error during customer status update:", err);
            AdminCommon.adminActivityLog(
              admin_id,
              "Customer",
              "status",
              "0",
              JSON.stringify({ customer_id, ...changes }),
              err,
              () => {}
            );
            return res.status(500).json({
              status: false,
              message: "Failed to update customer status. Please try again.",
              token: newToken,
            });
          }

          AdminCommon.adminActivityLog(
            admin_id,
            "Customer",
            "status",
            "1",
            JSON.stringify({ customer_id, ...changes }),
            null,
            () => {}
          );

          res.status(200).json({
            status: true,
            message: "Customer status updated successfully.",
            customer: result,
            token: newToken,
          });
        });
      });
    });
  });
};

exports.inactive = (req, res) => {
  const { customer_id, admin_id, _token } = req.query;

  // Define required fields
  const requiredFields = {
    customer_id,
    admin_id,
    _token,
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

  const action = JSON.stringify({ customer: "status" });

  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message,
      });
    }

    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Customer.getCustomerById(customer_id, (err, currentCustomer) => {
        if (err) {
          console.error("Database error during customer retrieval:", err);
          return res.status(500).json({
            status: false,
            message: "Failed to retrieve Customer. Please try again.",
            token: newToken,
          });
        }

        if (!currentCustomer) {
          return res.status(404).json({
            status: false,
            message: "Customer not found.",
            token: newToken,
          });
        }

        const changes = {};
        if (currentCustomer.status !== 0) {
          changes.status = { old: currentCustomer.status, new: 0 };
        }
        // Update the branch
        Customer.inactive(customer_id, (err, result) => {
          if (err) {
            console.error("Database error during customer status update:", err);
            AdminCommon.adminActivityLog(
              admin_id,
              "Customer",
              "status",
              "0",
              JSON.stringify({ customer_id, ...changes }),
              err,
              () => {}
            );
            return res.status(500).json({
              status: false,
              message: "Failed to update customer status. Please try again.",
              token: newToken,
            });
          }

          AdminCommon.adminActivityLog(
            admin_id,
            "Customer",
            "status",
            "1",
            JSON.stringify({ customer_id, ...changes }),
            null,
            () => {}
          );

          res.status(200).json({
            status: true,
            message: "Customer status updated successfully.",
            customer: result,
            token: newToken,
          });
        });
      });
    });
  });
};

exports.delete = (req, res) => {
  const { id, admin_id, _token } = req.query;

  // Validate required fields
  const missingFields = [];
  if (!id || id === "") missingFields.push("Customer ID");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = JSON.stringify({ customer: "delete" });

  // Check admin authorization
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      // Check the status returned by the authorization function
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Validate admin token
    AdminCommon.isAdminTokenValid(
      _token,
      admin_id,
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

        // Fetch the current customer
        Customer.getCustomerById(id, (err, currentCustomer) => {
          if (err) {
            console.error("Database error during customer retrieval:", err);
            return res.status(500).json({
              status: false,
              message: "Failed to retrieve customer. Please try again.",
              token: newToken,
            });
          }

          if (!currentCustomer) {
            return res.status(404).json({
              status: false,
              message: "Customer not found.",
              token: newToken,
            });
          }

          // Delete the customer
          Customer.delete(id, (err, result) => {
            if (err) {
              console.error("Database error during customer deletion:", err);
              AdminCommon.adminActivityLog(
                admin_id,
                "Customer",
                "Delete",
                "0",
                JSON.stringify({ id }),
                err,
                () => {}
              );
              return res.status(500).json({
                status: false,
                message: "Failed to delete customer. Please try again.",
                token: newToken,
              });
            }

            AdminCommon.adminActivityLog(
              admin_id,
              "Customer",
              "Delete",
              "1",
              JSON.stringify({ id }),
              null,
              () => {}
            );

            res.status(200).json({
              status: true,
              message: "Customer deleted successfully.",
              result,
              token: newToken,
            });
          });
        });
      }
    );
  });
};

exports.customerBasicInfoWithBranchAuth = (req, res) => {
  const { customer_id, branch_id, branch_token } = req.query;

  let missingFields = [];
  if (!customer_id || customer_id === "") missingFields.push("Customer ID");
  if (!branch_id || branch_id === "") missingFields.push("Branch ID");
  if (!branch_token || branch_token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Verify admin token
  BranchCommon.isBranchTokenValid(branch_token, branch_id, (err, result) => {
    if (err) {
      console.error("Error checking token validity:", err);
      return res.status(500).json({ status: false, message: err.message });
    }

    if (!result.status) {
      return res.status(401).json({ status: false, message: result.message });
    }

    const newToken = result.newToken;

    Customer.basicInfoByID(customer_id, (err, result) => {
      if (err) {
        console.error("Database error:", err);
        return res
          .status(500)
          .json({ status: false, message: err.message, token: newToken });
      }

      res.json({
        status: true,
        message: "Customer Info fetched successfully",
        customers: result,
        totalResults: result.length,
        token: newToken,
      });
    });
  });
};
