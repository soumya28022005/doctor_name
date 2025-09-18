import express from "express";
import bodyParser from "body-parser";

const app = express();
const port = 3000;

// --- Middleware ---
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

// --- In-Memory Data Storage (No Database) ---
let patients = [{ id: 1, name: "Soumya Chatterjee", dob: "2005-02-28", mobile: "1234567890", username: "soumya", password: "12345678" }];
let doctors = [{ id: 1, name: "Dr. Priya Verma", dob: null, mobile: null, specialty: "Cardiologist", username: "priya", password: "1234" }];
let receptionists = [{ id: 1, name: "Ravi Kumar", dob: null, mobile: null, username: "ravi", password: "password123" }];
let admins = [{ id: 1, name: "Admin User", dob: null, mobile: null, username: "admin", password: "password123" }];

let appointments = [
    { id: 1, patientId: 1, patientName: "Soumya Chatterjee", doctorId: 1, doctorName: "Dr. Priya Verma", date: "2025-09-20", time: "10:00 AM", status: "Confirmed" }
];

let last_patient_id = 1, last_doctors_id = 1, last_receptionists_id = 1, last_admins_id = 1;
let last_appointment_id = 1;

// --- Routes ---

// Home, Login, Signup pages (No changes here)
app.get("/", (req, res) => { res.render("index.ejs"); });
app.get("/login/:role", (req, res) => { res.render("login.ejs", { role: req.params.role, error: null }); });
app.get("/signup/:role", (req, res) => { res.render("signup.ejs", { role: req.params.role, error: null }); });

// Handle Login Logic (No changes here)
app.post("/login/:role", (req, res) => {
    const role = req.params.role;
    const { username, password } = req.body;
    let userList;
    switch(role) {
        case 'patient': userList = patients; break;
        case 'doctor': userList = doctors; break;
        case 'receptionist': userList = receptionists; break;
        case 'admin': userList = admins; break;
        default: return res.status(400).send("Invalid role");
    }
    const user = userList.find(u => u.username === username && u.password === password);
    if (user) {
        res.redirect(`/dashboard/${role}?userId=${user.id}`);
    } else {
        res.render("login.ejs", { role: role, error: "Invalid username or password." });
    }
});

// Handle Signup Logic (No changes here, but it will only be used by patients now)
app.post("/signup/:role", (req, res) => {
    const role = req.params.role;
    const { name, dob, mobile, username, password } = req.body;
    if (mobile.length !== 10) {
        return res.render("signup.ejs", { role: role, error: "Mobile number must be exactly 10 digits." });
    }
    let newId;
    // This will now only be used for patients due to frontend changes
    if (role === 'patient') {
        newId = ++last_patient_id;
        const newUser = { id: newId, name, dob, mobile, username, password };
        patients.push(newUser);
          console.log("New user added:", newUser);
    } else {
        return res.status(403).send("Signup is only allowed for patients.");
    }
    res.redirect(`/login/${role}`);
});

// NEW ROUTE: Admin adds a new doctor
app.post("/admin/add-doctor", (req, res) => {
    const { name, specialty, username, password, adminId } = req.body;
    const newDoctor = {
        id: ++last_doctors_id,
        name,
        dob: null,
        mobile: null,
        specialty,
        username,
        password
    };
    doctors.push(newDoctor);
    console.log("New doctor added:", newDoctor);
    res.redirect(`/dashboard/admin?userId=${adminId}`);
});


// Dashboards for each role
app.get("/dashboard/:role", (req, res) => {
    const { role } = req.params;
    const { userId } = req.query;
    switch(role) {
        case 'patient':
            const patient = patients.find(p => p.id == userId);
            const patientAppointments = appointments.filter(a => a.patientId == userId);
            if (!patient) return res.redirect(`/login/patient`);
            res.render("patient-dashboard.ejs", { patient, appointments: patientAppointments, doctors });
            break;
        case 'doctor':
            const doctor = doctors.find(d => d.id == userId);
            if (!doctor) return res.redirect(`/login/doctor`);
            const enrichedAppointments = appointments
                .filter(app => app.doctorId == userId)
                .map(appointment => {
                    const patientInfo = patients.find(p => p.id === appointment.patientId);
                    return { ...appointment, patient: patientInfo };
                });
            res.render("doctor-dashboard.ejs", { doctor, appointments: enrichedAppointments });
            break;
        case 'receptionist':
            const receptionist = receptionists.find(r => r.id == userId);
            if (!receptionist) return res.redirect(`/login/receptionist`);
            res.render("receptionist-dashboard.ejs", { receptionist, appointments, patients });
            break;
        case 'admin':
            const admin = admins.find(a => a.id == userId);
            if (!admin) return res.redirect(`/login/admin`);
            res.render("admin-dashboard.ejs", { admin, patients, doctors, receptionists, appointments });
            break;
        default:
            res.status(404).send("Dashboard not found");
    }
});


// Handle booking appointment
app.post("/book-appointment", (req, res) => {
    const { patientId, doctorId, date, time } = req.body;
    const patient = patients.find(p => p.id == patientId);
    const doctor = doctors.find(d => d.id == doctorId);
    const newAppointment = {
        id: ++last_appointment_id,
        patientId: parseInt(patientId),
        patientName: patient.name,
        doctorId: parseInt(doctorId),
        doctorName: doctor.name,
        date: date,
        time: time,
        status: "Confirmed"
    };
    appointments.push(newAppointment);
    res.redirect(`/dashboard/patient?userId=${patientId}`);
});


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});