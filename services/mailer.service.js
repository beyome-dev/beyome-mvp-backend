const nodemailer = require('nodemailer');
const ejs = require('ejs');
const fs = require('fs');
const config = require('../config');
const service = config.email.service;
const email = config.email.user;
const password = config.email.password;

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

const sendMail = async (to, subject, templateName, data) => {
    const template = fs.readFileSync(`./templates/${templateName}.ejs`, 'utf-8');
    const compiledTemplate = ejs.compile(template);

    const mailOptions = {
        from: email, 
        to: to,
        subject: subject,
        html: compiledTemplate(data),
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${to}`);
        return { success: true };
    } catch (error) {
        console.error("Brevo Error:", error);
        return { success: false, error };
    }
};

module.exports = { sendMail };

module.exports = {
    sendMail,
}