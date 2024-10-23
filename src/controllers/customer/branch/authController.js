const crypto = require("crypto");
const BranchAuth = require("../../../models/customer/branch/branchAuthModel");
const Common = require("../../../models/customer/branch/commonModel");
const AppModel = require("../../../models/appModel");

// Utility function to generate a random token
const generateToken = () => crypto.randomBytes(32).toString("hex");

// Utility function to get token expiry time (1 hour from current time)
const getTokenExpiry = () => new Date(Date.now() + 3600000).toISOString();

const {
  forgetPassword,
} = require("../../../mailer/customer/branch/auth/forgetPassword");

// Branch login handler
exports.login = (req, res) => {
  const { username, password } = req.body;
  const missingFields = [];

  // Validate required fields
  if (!username || username === "") missingFields.push("Username");
  if (!password || password === "") missingFields.push("Password");

  // If there are missing fields, return an error response
  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Find branch by email or mobile number
  BranchAuth.findByEmailOrMobile(username, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ status: false, message: err.message });
    }

    // If no branch found, return a 404 response
    if (result.length === 0) {
      return res.status(404).json({
        status: false,
        message: "Branch not found with the provided email or mobile number",
      });
    }

    const branch = result[0];

    BranchAuth.isCustomerActive(
      branch.customer_id,
      (customerErr, isCustomerActive) => {
        if (customerErr) {
          console.error("Database error:", customerErr);
          return res
            .status(500)
            .json({ status: false, message: customerErr.message });
        }

        // If customer is not active, return a 404 response
        if (!isCustomerActive) {
          return res.status(404).json({
            status: false,
            message: "Parent Company is not active",
          });
        }

        // Find branch by email or mobile number
        BranchAuth.isBranchActive(branch.id, (err, isActive) => {
          if (err) {
            console.error("Database error:", err);
            return res
              .status(500)
              .json({ status: false, message: err.message });
          }

          // If branch is not found or is not active, return a 404 response
          if (isActive === false) {
            return res.status(404).json({
              status: false,
              message: "Branch not active",
            });
          }

          // Validate password
          BranchAuth.validatePassword(username, password, (err, isValid) => {
            if (err) {
              console.error("Database error:", err);
              Common.branchLoginLog(
                branch.id,
                "login",
                "0",
                err.message,
                () => {}
              );
              return res
                .status(500)
                .json({ status: false, message: err.message });
            }

            // If the password is incorrect, log the attempt and return a 401 response
            if (!isValid) {
              Common.branchLoginLog(
                branch.id,
                "login",
                "0",
                "Incorrect password",
                () => {}
              );
              return res
                .status(401)
                .json({ status: false, message: "Incorrect password" });
            }

            if (branch.status == 0) {
              Common.branchLoginLog(
                branch.id,
                "login",
                "0",
                "Branch account is not yet verified.",
                () => {}
              );
              return res.status(400).json({
                status: false,
                message:
                  "Branch account is not yet verified. Please complete the verification process before proceeding.",
              });
            }

            if (branch.status == 2) {
              Common.branchLoginLog(
                branch.id,
                "login",
                "0",
                "Branch account has been suspended.",
                () => {}
              );
              return res.status(400).json({
                status: false,
                message:
                  "Branch account has been suspended. Please contact the help desk for further assistance.",
              });
            }

            // Get current time and token expiry
            const currentTime = new Date(); // Current time
            const tokenExpiry = new Date(branch.token_expiry); // Convert token_expiry to Date object

            // Check if the existing token is still valid
            if (branch.login_token && tokenExpiry > currentTime) {
              Common.branchLoginLog(
                branch.id,
                "login",
                "0",
                "Another branch is currently logged in.",
                () => {}
              );
              return res.status(400).json({
                status: false,
                message:
                  "Another branch is currently logged in. Please try again later.",
              });
            }

            // Generate new token and expiry time
            const token = generateToken();
            const newTokenExpiry = getTokenExpiry(); // This will be an ISO string

            // Update the token in the database
            BranchAuth.updateToken(branch.id, token, newTokenExpiry, (err) => {
              if (err) {
                console.error("Database error:", err);
                Common.branchLoginLog(
                  branch.id,
                  "login",
                  "0",
                  "Error updating token: " + err.message,
                  () => {}
                );
                return res.status(500).json({
                  status: false,
                  message: `Error updating token: ${err.message}`,
                });
              }

              // Log successful login and return the response
              Common.branchLoginLog(branch.id, "login", "1", null, () => {});
              const { login_token, token_expiry, ...branchDataWithoutToken } =
                branch;

              res.json({
                status: true,
                message: "Login successful",
                branchData: branchDataWithoutToken,
                token,
              });
            });
          });
        });
      }
    );
  });
};

exports.updatePassword = (req, res) => {
  const { new_password, branch_id, _token } = req.body;

  // Validate required fields
  const missingFields = [];

  if (
    !new_password ||
    new_password === "" ||
    new_password === undefined ||
    new_password === "undefined"
  ) {
    missingFields.push("New Password");
  }

  if (
    !branch_id ||
    branch_id === "" ||
    branch_id === undefined ||
    branch_id === "undefined"
  ) {
    missingFields.push("Branch ID");
  }

  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  ) {
    missingFields.push("Token");
  }

  // If required fields are missing, return error
  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Validate branch token
  Common.isBranchTokenValid(_token, branch_id, (err, result) => {
    if (err) {
      console.error("Error checking token validity:", err);
      return res.status(500).json({ status: false, message: err.message });
    }

    if (!result.status) {
      return res.status(401).json({ status: false, message: result.message });
    }

    const newToken = result.newToken;

    // Check if employee ID is unique
    BranchAuth.updatePassword(new_password, branch_id, (err, result) => {
      if (err) {
        console.error("Database error during password update:", err.message);
        Common.branchActivityLog(
          branch_id,
          "Password",
          "Update",
          "o",
          "Branch attempted to update password",
          null,
          () => {}
        );
        return res.status(500).json({
          status: false,
          message: "Failed to update password. Please try again later.",
          token: newToken,
        });
      }

      Common.branchActivityLog(
        branch_id,
        "Password",
        "Update",
        "1",
        "Branch successfully updated password",
        null,
        () => {}
      );

      return res.status(200).json({
        status: true,
        message: "Password updated successfully.",
        data: result,
        token: newToken,
      });
    });
  });
};

// Branch logout handler
exports.logout = (req, res) => {
  const { branch_id, _token } = req.query;

  // Validate required fields and create a custom message
  let missingFields = [];
  if (!branch_id || branch_id === "") missingFields.push("Branch ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Validate the branch token
  Common.isBranchTokenValid(_token, branch_id, (err, result) => {
    if (err) {
      console.error("Error checking token validity:", err);
      return res.status(500).json(err);
    }

    if (!result.status) {
      return res.status(401).json({ status: false, message: result.message });
    }

    // Update the token in the database to null
    BranchAuth.logout(branch_id, (err) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: `Error logging out: ${err.message}`,
        });
      }

      res.json({
        status: true,
        message: "Logout successful",
      });
    });
  });
};

// Branch login validation handler
exports.validateLogin = (req, res) => {
  const { branch_id, _token } = req.body;
  const missingFields = [];

  // Validate required fields
  if (!branch_id || branch_id === "") missingFields.push("Branch ID");
  if (!_token || _token === "") missingFields.push("Token");

  // If there are missing fields, return an error response
  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Fetch the branch record by branch_id to retrieve the saved token and expiry
  BranchAuth.validateLogin(branch_id, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({ status: false, message: err.message });
    }

    if (result.length === 0) {
      return res
        .status(404)
        .json({ status: false, message: "Branch not found" });
    }

    const branch = result[0];
    const isTokenValid =
      branch.login_token === _token &&
      new Date(branch.token_expiry) > new Date();

    if (!isTokenValid) {
      return res.status(401).json({
        status: false,
        message: "Invalid or expired token",
      });
    }

    res.json({
      status: true,
      message: "Login validated successfully",
    });
  });
};

exports.forgotPasswordRequest = (req, res) => {
  const { email } = req.body;

  // Validate the input email
  if (!email || email.trim() === "") {
    return res.status(400).json({
      status: false,
      message: "Email is required.",
    });
  }

  // Check if an branch exists with the provided email
  BranchAuth.findByEmailOrMobileAllInfo(email, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res.status(500).json({
        status: false,
        message:
          "An error occurred while processing your request. Please try again.",
      });
    }

    // If no branch found, return a 404 response
    if (result.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No branch found with the provided email.",
      });
    }

    const branch = result[0];

    // Retrieve application information for the reset link
    AppModel.appInfo("frontend", (err, appInfo) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message:
            "An error occurred while retrieving application information. Please try again.",
        });
      }

      if (appInfo) {
        const token = generateToken();
        const tokenExpiry = getTokenExpiry(); // ISO string for expiry time

        // Update the reset password token in the database
        BranchAuth.setResetPasswordToken(
          branch.id,
          token,
          tokenExpiry,
          (err) => {
            if (err) {
              console.error("Error updating reset password token:", err);
              Common.branchLoginLog(
                branch.id,
                "forgot-password",
                "0",
                `Error updating token: ${err.message}`,
                () => {}
              );
              return res.status(500).json({
                status: false,
                message:
                  "An error occurred while generating the reset password token. Please try again.",
              });
            }

            // Send password reset email
            const resetLink = `${
              appInfo.host || "https://www.goldquestglobal.com"
            }/branch/reset-password?email=${branch.email}&token=${token}`;
            const toArr = [{ name: branch.name, email: branch.email }];

            forgetPassword(
              "branch auth",
              "forget-password",
              branch.name,
              resetLink,
              toArr
            )
              .then(() => {
                Common.branchLoginLog(
                  branch.id,
                  "forgot-password",
                  "1",
                  null,
                  () => {}
                );
                return res.status(200).json({
                  status: true,
                  message: `A password reset email has been successfully sent to ${branch.name}.`,
                });
              })
              .catch((emailError) => {
                console.error(
                  "Error sending password reset email:",
                  emailError
                );
                Common.branchLoginLog(
                  branch.id,
                  "forgot-password",
                  "0",
                  `Failed to send email: ${emailError.message}`,
                  () => {}
                );
                return res.status(500).json({
                  status: false,
                  message: `Failed to send password reset email to ${branch.name}. Please try again later.`,
                });
              });
          }
        );
      } else {
        return res.status(500).json({
          status: false,
          message:
            "Application information is not available. Please try again later.",
        });
      }
    });
  });
};

exports.forgotPassword = (req, res) => {
  const { new_password, email, password_token } = req.body;
  const missingFields = [];

  // Validate required fields
  if (!new_password || new_password.trim() === "") {
    missingFields.push("New Password");
  }
  if (!email || email.trim() === "") {
    missingFields.push("Email");
  }
  if (!password_token || password_token.trim() === "") {
    missingFields.push("Password Token");
  }

  // Return error if there are missing fields
  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Fetch branch details using the provided email
  BranchAuth.findByEmailOrMobileAllInfo(email, (err, result) => {
    if (err) {
      console.error("Database error:", err);
      return res
        .status(500)
        .json({ status: false, message: "Internal server error." });
    }

    // Return error if no branch found
    if (!result || result.length === 0) {
      return res.status(404).json({
        status: false,
        message: "No branch found with the provided email.",
      });
    }

    const branch = result[0];
    const tokenExpiry = new Date(branch.password_token_expiry);
    const currentTime = new Date();

    // Check if the token is still valid
    if (currentTime > tokenExpiry) {
      return res.status(401).json({
        status: false,
        message: "Password reset token has expired. Please request a new one.",
      });
    }

    // Verify if the token matches
    if (branch.reset_password_token !== password_token) {
      return res.status(401).json({
        status: false,
        message: "Invalid password reset token.",
      });
    }

    // Proceed to update the password
    BranchAuth.updatePassword(new_password, branch.id, (err, result) => {
      if (err) {
        console.error("Database error during password update:", err.message);
        Common.branchActivityLog(
          branch.id,
          "Password",
          "Update",
          "0",
          "Failed password update attempt",
          err.message,
          () => {}
        );
        return res.status(500).json({
          status: false,
          message: "Failed to update password. Please try again later.",
        });
      }

      // Log successful password update
      Common.branchActivityLog(
        branch.id,
        "Password",
        "Update",
        "1",
        "Branch password updated successfully",
        null,
        () => {}
      );

      return res.status(200).json({
        status: true,
        message: "Password updated successfully.",
      });
    });
  });
};
