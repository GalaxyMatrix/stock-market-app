import nodemailer from 'nodemailer';
import { NEWS_SUMMARY_EMAIL_TEMPLATE, WELCOME_EMAIL_TEMPLATE } from './template';


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

export const sendNewsSummaryEmail = async ({
    email,
    date,
    newsContent,
}: NewsSummaryEmailData) => {
    const htmlTemplate = NEWS_SUMMARY_EMAIL_TEMPLATE
        .replace('{{date}}', date)
        .replace('{{newsContent}}', newsContent);

    await transporter.sendMail({
        from: '"Signalist" <signalist.dev@gmail.com>',
        to: email,
        subject: `Market News Summary Today - ${date}`,
        text: `Your Signalist market news summary for ${date}`,
        html: htmlTemplate,
    });
}