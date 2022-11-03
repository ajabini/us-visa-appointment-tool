import { chromium } from "playwright";
import { config } from "./config.js";

const main = async () => {
    try {
        const browser = await chromium.launch({ headless: true, slowMo: 600, channel: 'msedge' });
        const page = await browser.newPage();
        await page.goto('https://ais.usvisa-info.com/en-ca/niv/users/sign_in');
        const userEmailInput = page.locator('#user_email');
        const userPasswordInput = page.locator('#user_password');
        const policyCheckbox = page.locator('#policy_confirmed');
        const loginButton = page.locator('[name=commit]');
        await userEmailInput.fill(config.userEmail);
        await userPasswordInput.fill(config.password);
        await policyCheckbox.check({ force: true });
        await loginButton.click();

        let currentAppointmentDate = null; // This will be null if no appointment is booked previously
        const currentAppointmentDiv = page.locator('p.consular-appt').nth(0);
        if(await currentAppointmentDiv.count() > 0) {
            const currentAppointmentDivContent = await currentAppointmentDiv.innerHTML();
            const currentAppointmentText = currentAppointmentDivContent.split('</strong>')[1];
            const _currentAppointmentDate = currentAppointmentText.split(',')[0] + ' ' + currentAppointmentText.split(',')[1];
            currentAppointmentDate = new Date(_currentAppointmentDate);
            console.log("Current appointment date found: ", currentAppointmentDate);
        }

        const continueButton = page.locator("'Continue'").nth(0);
        const continueUrl = await continueButton.getAttribute('href');
        const urlBase = 'https://ais.usvisa-info.com' + continueUrl.replace("continue_actions", "")
        await page.goto(urlBase + 'appointment');

        const appointmentLocationDropdown = page.locator('#appointments_consulate_appointment_facility_id');
        await appointmentLocationDropdown.selectOption({ label: config.location });

        const errorText = page.locator('#consulate_date_time_not_available');
        const isError = await errorText.isVisible();
        if (isError) {
            console.log("No appointments error");
            await browser.close();
            return;
        }
        const appointmentDateOption = page.locator('#appointments_consulate_appointment_date');
        await appointmentDateOption.click();
        const nextButton = page.locator('a.ui-datepicker-next');

        const _lowerLimitDate = config.lowerLimitDate;
        let lowerLimitDate = new Date(_lowerLimitDate);
        console.log("The tool will search for appointments on/after: ", lowerLimitDate);
        lowerLimitDate = currentAppointmentDate ? max(currentAppointmentDate, lowerLimitDate) : lowerLimitDate;

        let currentCalendarTitle = await getCalendarTitle(page);
        while (currentCalendarTitle.getMonth() != lowerLimitDate.getMonth() || currentCalendarTitle.getFullYear() != lowerLimitDate.getFullYear()) {
            await nextButton.click();
            currentCalendarTitle = await getCalendarTitle(page);
        }

        const calendars = page.locator('table.ui-datepicker-calendar >> nth=0');
        const appointmentDays = calendars.locator("[data-event=click]")
        let appointmentDay = undefined;
        let isAppointmentAvailable = false;
        let shouldGoToNext = true;
        let nextClicks = 0;
        do {
            currentCalendarTitle = await getCalendarTitle(page);
            const count = await appointmentDays.count();
            for (let i = 0; i < count; i++) {
                appointmentDay = appointmentDays.nth(i);
                const newAppointmentMonth = await appointmentDay.getAttribute('data-month');
                const newAppointmentYear = await appointmentDay.getAttribute('data-year');
                const newAppointmentDay = await appointmentDay.locator('a').innerHTML();
                const newAppointmentDate = new Date(newAppointmentYear, newAppointmentMonth, newAppointmentDay);
                if (newAppointmentDate >= lowerLimitDate) {
                    console.log("New appointment date available: ", newAppointmentDate);
                    console.log(newAppointmentDate);
                    isAppointmentAvailable = true;
                    break;
                }
            }
            if (isAppointmentAvailable) break;
            await nextButton.click();
            nextClicks++;
            // Handle case for first appointment and reschedule cases conditional on whether currentAppointmentDate is set
            shouldGoToNext = currentAppointmentDate 
                            ? currentCalendarTitle.getMonth() != currentAppointmentDate.getMonth() || currentCalendarTitle.getFullYear() != currentAppointmentDate.getFullYear() 
                            : nextClicks < config.maxSpan;
        }
        while (shouldGoToNext);
        if (isAppointmentAvailable) {
            const newAppointmentMonth = await appointmentDay.getAttribute('data-month');
            const newAppointmentYear = await appointmentDay.getAttribute('data-year');
            const newAppointmentDay = await appointmentDay.locator('a').innerHTML();
            const newAppointmentDate = new Date(newAppointmentYear, newAppointmentMonth, newAppointmentDay);
            if (newAppointmentDate < currentAppointmentDate) {
                await appointmentDay.click();
                const appointmentTimeDropdown = page.locator('#appointments_consulate_appointment_time');
                appointmentTimeDropdown.selectOption({ index: 1 });
                const rescheduleButton = page.locator('#appointments_submit');
                await rescheduleButton.click();
                const confirmButton = page.locator("'Confirm'");
                await confirmButton.click();
                console.log("New appointment date booked: ", newAppointmentDate);
            }
        } else {
            console.log("No appointments found");
        }
        await browser.close();
    } catch (err) {
        console.log("Error: ", err);
    }
}

const getCalendarTitle = async (page) => {
    const month = await page.locator('span.ui-datepicker-month >> nth=0').innerHTML();
    const year = await page.locator('span.ui-datepicker-year >> nth=0').innerHTML();
    return new Date(month + ' ' + year);
}

main();
setInterval(() => { main() }, config.intervalInMins * 60 * 1000);