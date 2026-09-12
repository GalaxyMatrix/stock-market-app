import nodemailer from 'nodemailer';
import { WELCOME_EMAIL_TEMPLATE } from './template';


export const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
    },
});

export const sendWelcomeEmail = async({email, name, intro}: WelcomeEmailData) => {
    const htmlTemplate = WELCOME_EMAIL_TEMPLATE.replace('{{name}}', name).replace('{{intro}}', intro);

    const mailOptions = {
        from : '"Signalist" <signalist.dev@gmail.com>',
        to : email,
        subject : 'Welcome to Signalist - Your Stock Market toolkit is ready to use',
        text: 'Thank you for signing up for Signalist',
        html : htmlTemplate,
    }

    await transporter.sendMail(mailOptions);
}