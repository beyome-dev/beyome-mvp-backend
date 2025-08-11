const nodemailer = require('nodemailer');
const ejs = require('ejs');
const fs = require('fs');
const config = require('../config');
const service = config.email.service;
const email = config.email.user;
const password = config.email.password;
const { TransactionalEmailsApi, SendSmtpEmail } = require("@getbrevo/brevo");

// const transporter = nodemailer.createTransport({
//     service: service,
//     auth: {
//         user: email,
//         pass: password
//     }
// });


// if you want to attach an image to the ejs file uncomment the attachment lines
const getAttachments = (templateName) => {
    switch (templateName) {
        case 'confirm-email':
            return [{
                filename: 'email.png',
                path: './public/images/email.png',
                cid: 'email_logo'
            },]
        case 'forgot-password-email':
            return [];
        default:
            return [];
    }
}

// const sendMail = async (to, subject, templateName, data) => {
//     const template = fs.readFileSync(`./templates/${templateName}.ejs`, 'utf-8');
//     const compiledTemplate = ejs.compile(template);
//     // const attachments = getAttachments(templateName);

//     const mailOptions = {
//         from: email,
//         to: to,
//         subject: subject,
//         html: compiledTemplate(data),
//         // attachments: attachments
//     };
//     let info = transporter.sendMail(mailOptions);
//     transporter.close();
//     return info;
// }

const transporter = nodemailer.createTransport({
    host: "smtp-relay.sendinblue.com",
    port: 587,
    auth: {
        user: config.email.brevoUser, // Your Brevo SMTP user
        pass: config.email.brevoPassword, // Your Brevo SMTP password
    },
});

// const brevoCampaign = async (to, subject, templateName, data) => {
//  var SibApiV3Sdk = require('sib-api-v3-sdk');
//     //------------------
//     // Create a campaign\
//     // ------------------
//     // Include the Brevo library\
//     var defaultClient = SibApiV3Sdk.ApiClient.instance;
//     // Instantiate the client
//     var apiKey = defaultClient.authentications['api-key'];
//     apiKey.apiKey = 'YOUR_API_V3_KEY';
//     var apiInstance = new SibApiV3Sdk.EmailCampaignsApi();
//     var emailCampaigns = new SibApiV3Sdk.CreateEmailCampaign();
//     // Define the campaign settings\
//     emailCampaigns.name = "Campaign sent via the API";
//     emailCampaigns.subject = "My subject";
//     emailCampaigns.sender = {"name": "From name", "email": "myfromemail@mycompany.com"};
//     emailCampaigns.type = "classic";
//     //  Content that will be sent\
//     {
//     htmlContent: 'Congratulations! You successfully sent this example campaign via the Brevo API.',
//     //  Select the recipients\
//     recipients: {listIds: [2, 7]},
//     //  Schedule the sending in one hour\
//     scheduledAt: '2018-01-01 00:00:01'
// }
//     // Make the call to the client\
//     apiInstance.createEmailCampaign(emailCampaigns).then(function(data) {
// console.log(API called successfully. Returned data: ' + data);
// }, function(error) {
// console.error(error);
// });

    
const brevoSendMail = async (toEmail, toName, subjec, htmlContent, textContent) => {
    let emailAPI = new TransactionalEmailsApi();
    emailAPI.authentications.apiKey.apiKey = "xkeysib-xxxxxxxxxxxxxxxxxxxxx"
    let message = new SendSmtpEmail();
    message.subject = subjec;
    if (htmlContent) {
        message.htmlContent = htmlContent;
    }
    if (textContent) {
        message.textContent = textContent;
    }
    message.sender = { name: "Recapp", email: email };
    message.to = [{ email: toEmail, name: toName }];
    await emailAPI.sendTransacEmail(message)
}

const sendMail = async (toEmail, toName, subject, templateName, data) => {
    const template = fs.readFileSync(`./templates/${templateName}.ejs`, 'utf-8');
    const compiledTemplate = ejs.compile(template);

    // const mailOptions = {
    //     from: email, 
    //     to: to,
    //     subject: subject,
    //     html: compiledTemplate(data),
    // };

    try {
        await brevoSendMail(toName, toEmail, subject, compiledTemplate(data));
        // await transporter.sendMail(mailOptions);
        // console.log(`Email sent to ${to}`);
        // return { success: true };
    } catch (error) {
        console.error("Brevo Error:", error);
        return { success: false, error };
    }
}

module.exports = { sendMail };