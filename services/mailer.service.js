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
        case 'register-email':
            return [{
                filename: 'demo_kit.pdf',
                path: './public/docs/demo_kit.pdf',
                cid: 'email_logo'
            },]
        case 'forgot-password-email':
            return [];
        default:
            return [];
    }
}
    
const brevoSendMail = async (toEmail, toName, subjec, htmlContent, textContent, attachments) => {
    let emailAPI = new TransactionalEmailsApi();
    emailAPI.authentications.apiKey.apiKey = config.email.brevoApiKey
    let message = new SendSmtpEmail();
    message.subject = subjec;
    if (htmlContent) {
        message.htmlContent = htmlContent;
    }
    if (textContent) {
        message.textContent = textContent;
    }

    message.attachment = attachments;
    message.sender = { name: "Recapp", email: email || "care@recapp.me" };
    
    // Split emails and names by comma
    const emails = toEmail.split(',').map(email => email.trim());
    const names = toName ? toName.split(',').map(name => name.trim()) : [];
    
    // Create recipients array
    const recipients = emails.map((email, index) => {
        const name = names[index] || "Therapist"; // Use "Therapist" as default if name not provided
        return { email, name };
    });
    
    message.to = recipients;
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

     // Get attachments based on template
    const attachments = getAttachments(templateName).map(attachment => ({
        content: fs.readFileSync(attachment.path).toString('base64'),
        name: attachment.filename,
        // If it's an inline attachment (like images in email body)
        disposition: attachment.cid ? "inline" : "attachment",
        contentId: attachment.cid || undefined
    }));

    try {
        await brevoSendMail(toEmail, toName, subject, compiledTemplate(data), null, attachments);
        // await transporter.sendMail(mailOptions);
        // console.log(`Email sent to ${to}`);
        // return { success: true };
    } catch (error) {
        console.error("Brevo Error:", error);
        return { success: false, error };
    }
}

module.exports = { sendMail };