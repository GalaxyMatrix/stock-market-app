import nodemailer from 'nodemailer';
import {
    NEWS_SUMMARY_EMAIL_TEMPLATE,
    WELCOME_EMAIL_TEMPLATE,
    STOCK_ALERT_UPPER_EMAIL_TEMPLATE,
    STOCK_ALERT_LOWER_EMAIL_TEMPLATE,
    VOLUME_ALERT_EMAIL_TEMPLATE,
} from './template';


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

export const sendStockAlertEmail = async ({
    email,
    symbol,
    company,
    currentPrice,
    targetPrice,
    timestamp,
    alertType,
}: StockAlertEmailData) => {
    const template = alertType === 'upper' ? STOCK_ALERT_UPPER_EMAIL_TEMPLATE : STOCK_ALERT_LOWER_EMAIL_TEMPLATE;

    const htmlTemplate = template
        .replace(/{{symbol}}/g, symbol)
        .replace(/{{company}}/g, company)
        .replace(/{{currentPrice}}/g, currentPrice)
        .replace(/{{targetPrice}}/g, targetPrice)
        .replace(/{{timestamp}}/g, timestamp);

    await transporter.sendMail({
        from: '"Signalist" <signalist.dev@gmail.com>',
        to: email,
        subject: `Price Alert: ${symbol} ${alertType === 'upper' ? 'hit your upper target' : 'hit your lower target'}`,
        text: `${symbol} is now trading at ${currentPrice}, crossing your target of ${targetPrice}.`,
        html: htmlTemplate,
    });
};

export const sendVolumeAlertEmail = async ({
    email,
    symbol,
    company,
    currentVolume,
    currentPrice,
    changeDirection,
    changePercent,
    priceColor,
    alertMessage,
    averageVolume,
    volumeSpike,
    timestamp,
}: VolumeAlertEmailData) => {
    const htmlTemplate = VOLUME_ALERT_EMAIL_TEMPLATE
        .replace(/{{symbol}}/g, symbol)
        .replace(/{{company}}/g, company)
        .replace(/{{currentVolume}}/g, currentVolume)
        .replace(/{{currentPrice}}/g, currentPrice)
        .replace(/{{changeDirection}}/g, changeDirection)
        .replace(/{{changePercent}}/g, changePercent)
        .replace(/{{priceColor}}/g, priceColor)
        .replace(/{{alertMessage}}/g, alertMessage)
        .replace(/{{averageVolume}}/g, averageVolume)
        .replace(/{{volumeSpike}}/g, volumeSpike)
        .replace(/{{timestamp}}/g, timestamp);

    await transporter.sendMail({
        from: '"Signalist" <signalist.dev@gmail.com>',
        to: email,
        subject: `Volume Alert: ${symbol} trading volume spiked`,
        text: `${symbol} volume spiked to ${currentVolume}M shares, ${volumeSpike} above average.`,
        html: htmlTemplate,
    });
};