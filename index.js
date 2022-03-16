import { Selector } from "testcafe";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

console.log("Time: ", new Date().toISOString());

fixture`Main polling`
  .page`https://bmvs.onlineappointmentscheduling.net.au/oasis/Search.aspx`;

const POSTCODE = "2000";
const applicants = [
  {
    email: "some-email@domain.com",
    givenName: "John",
    lastName: "Doe",
    dateOfBirth: "01/01/1990",
  },
];

const locations = ["Sydney"];

const recipients = [
  {
    name: "John",
    email: "some-email@domain.com",
  },
];

for (let location of locations) {
  const { email, givenName, lastName, dateOfBirth } = applicants[0];
  test.timeouts({
    pageRequestTimeout: 60000,
  })(`Check available date for ${givenName} ${lastName}`, async (t) => {
    console.log("Logging in...");
    await t.typeText(Selector("#ContentPlaceHolder1_txtEmail"), email);
    await t.typeText(Selector("#ContentPlaceHolder1_txtFirstName"), givenName);
    await t.typeText(Selector("#ContentPlaceHolder1_txtSurname"), lastName);
    await t.typeText(Selector("#ContentPlaceHolder1_txtDOB"), dateOfBirth);
    await t.click(Selector("#ContentPlaceHolder1_btnSearch"));
    console.log("Change appointment...");
    await t.click(
      Selector("#ContentPlaceHolder1_repAppointments_lnkChangeAppointment_0")
    );
    const selectedLocation = await Selector(".tdlocNameTitle").textContent;
    if (location !== selectedLocation) {
      await t.typeText(
        Selector("#ContentPlaceHolder1_SelectLocation1_txtSuburb"),
        POSTCODE
      );
      await t.click(Selector(".postcode-search input[type='submit']"));
      await t.click(
        Selector(
          "#ContentPlaceHolder1_SelectLocation1_divLocations .tdlocNameTitle"
        ).withText(location)
      );
    }
    let shouldTryAgain = true;
    let nextAvailableDate,
      nextAvailableDateHour,
      fullCurrentAppointmentDate,
      currentAppointmentDate,
      currentAppointmentHour,
      currentAppointmentLocation;
    while (shouldTryAgain) {
      await t.click(Selector("#ContentPlaceHolder1_btnCont"));
      console.log(`Selecting ${selectedLocation}...`);
      fullCurrentAppointmentDate = await Selector(".appointments-row")
        .nth(0)
        .find(".fLeft").textContent;
      currentAppointmentDate = fullCurrentAppointmentDate
        .split(" @ ")[0]
        .trim();
      currentAppointmentHour = fullCurrentAppointmentDate
        .split(" @ ")[1]
        .trim();
      currentAppointmentLocation = (
        await Selector(".appointments-row").nth(1).find(".fLeft").textContent
      ).trim();

      try {
        nextAvailableDate = await Selector(
          "#ContentPlaceHolder1_SelectTime1_divSearchResults h2"
        ).textContent;
        nextAvailableDateHour = await Selector(
          '[for="ContentPlaceHolder1_SelectTime1_rblResults_0"]'
        ).textContent;
        console.log(new Date(nextAvailableDate).toISOString());
        shouldTryAgain =
          new Date(currentAppointmentDate) < new Date(nextAvailableDate) ||
          new Date(nextAvailableDate) <= new Date();
        if (shouldTryAgain) {
          throw "a";
        }
      } catch (e) {
        console.log("Trying again.....");
        await t.click(Selector(".blue-button:nth-child(2)"));
      }
    }

    if (
      new Date(currentAppointmentDate).setTime(
        new Date(currentAppointmentDate).getTime() //  + 14 * 24 * 3600 * 1000
      ) > new Date(nextAvailableDate)
    ) {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASSWORD,
        },
      });

      for (let recipient of recipients) {
        const { name, email } = recipient;

        var mailOptions = {
          from: "some-email@domain.com",
          to: email,
          subject: `Appointment available at ${nextAvailableDate}`,
          text: `
            Hi ${name}!

            A new BUPA visa medical services appointment slot has become available!

            Current appointment
            Date: ${currentAppointmentDate}
            Time: ${currentAppointmentHour}
            Location: ${currentAppointmentLocation}

            Next available appointment
            Date: ${nextAvailableDate}
            Time: ${nextAvailableDateHour}
            Location: ${location}

            You can update your appointment at https://bmvs.onlineappointmentscheduling.net.au/oasis/Search.aspx

            Regards,
            Mario's lil' code :D
            `,
        };

        transporter.sendMail(mailOptions, function (error, info) {
          if (error) {
            console.log(error);
          } else {
            console.log("Email sent: " + info.response);
          }
        });
      }
    }
    const logEntry = `${new Date().toISOString()},${location},${new Date(
      nextAvailableDate
    ).toISOString()}`;
    const today = new Date()
      .toLocaleDateString()
      .split("/")
      .reverse()
      .join("-");
    const fileName = path.join(__dirname, `./logs/${today}.csv`);
    fs.access(fileName, fs.F_OK, (error, a) => {
      const fsUtility = error ? "writeFile" : "appendFile";
      return fs[fsUtility](fileName, `${logEntry}\n`, (error) => {
        if (error) throw error;
      });
    });
    await t.wait(5000);
  });
}
