constcrypto = require("crypto");
constCustomer = require("../../models/customer/customerModel");
constAdminCommon = require("../../models/admin/commonModel");

constisEmail = (username) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);
constgenerateToken = () => crypto.randomBytes(32).toString("hex");
constgetTokenExpiry = () => newDate(Date.now() + 3600000).toISOString();

exports.create = (req, res) => {
  const {
    admin_id,
    _token,
    company_name,
    client_code,
    package_name,
    state,
    state_code,
    mobile_number,
    email,
    cc1_email,
    cc2_email,
    contact_person,
    role,
    name_of_escalation,
    client_spoc,
    gstin,
    tat,
    date_agreement,
    client_standard,
    Agreement_Period,
    agr_upload,
    yes,
    branch_name,
    branch_email
  } = req.body;

  constmissingFields = [];

  constrequiredFields = {
    company_name,
    client_code,
    package_name,
    state,
    state_code,
    mobile_number,
    email,
    contact_person,
    role,
    name_of_escalation,
    client_spoc,
    gstin,
    tat,
    date_agreement,
    client_standard,
    Agreement_Period,
    agr_upload,
    branch_name,
    branch_email
  };

  Object.keys(requiredFields).forEach(field => {
    if (!requiredFields[field]) {
      missingFields.push(field.replace(/_/g, ''));
    }
  });

  if (missingFields.length > 0) {
    returnres.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(",")}`,
    });
  }


  AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
    if (err) {
      console.error("Error checking token validity: ", err);
      returnres.status(500).json(err);
    }

    if (!result.status) {
      returnres.status(401).json({ status: false, message: result.message });
    }

    constnewToken = result.newToken;

    Customer.create({
      admin_id,
      client_unique_id: client_code,
      client_id: client_code,
      name: company_name,
      profile_picture: null,
      email,
      email_verified_at: null,
      mobile: mobile_number,
      mobile_verified_at: null,
      password: null,
      reset_password_token: null,
      login_token: generateToken(),
      token_expiry: getTokenExpiry(),
      role,
      status: '0',
      created_at: newDate(),
      updated_at: newDate(),
      admin_id
    }, (err, result) => {
      if (err) {
        console.error("Database error:", err);
        AdminCommon.adminActivityLog(
          admin_id,
          "Customer",
          "Create",
          "0",
          null,
          err.message,
          () => { }
        );
        returnres.status(500).json({ status: false, message: err.message });
      }

      constcustomerId = result.insertId;

      Customer.createCustomerMeta({
        customer_id: customerId,
        company_name,
        address: null,
        phone_number: mobile_number,
        email,
        email2: cc1_email,
        email3: cc2_email,
        email4: null,
        secondary_username: null,
        contact_person_name: contact_person,
        contact_person_title: role,
        escalation_point_contact: name_of_escalation,
        single_point_of_contact: client_spoc,
        gst_number: gstin,
        tat_days: tat,
        service_description: null,
        service_fee: null,
        agreement_text: agr_upload,
        agreement_expiration_date: date_agreement,
        agreement_duration: Agreement_Period,
        agreement_document: agr_upload,
        custom_template: yes || 'no',
        logo: null,
        custom_billing_address: null,
        status: '0',
        state,
        state_code,
        additional_login_info: null,
        standard_operating_procedures: null,
        record_creation_date: newDate(),
        package_category: null,
        service_codes: null,
        payment_contact_person: contact_person
      }, (err, metaResult) => {
        if (err) {
          console.error("Database error for customer meta:", err);
          AdminCommon.adminActivityLog(
            admin_id,
            "Customer",
            "CreateMeta",
            "0",
            `{id:${customerId}}`,
            err.message,
            () => { }
          );
          returnres.status(500).json({ status: false, message: err.message });
        }

        AdminCommon.adminActivityLog(
          admin_id,
          "Customer",
          "Create",
          "1",
          `{id:${customerId}}`,
          null,
          () => { }
        );

        res.json({
          status: true,
          message: "Customer created successfully",
          data: {
            customer: result,
            meta: metaResult
          }
        });
      });
    });
  });
};
