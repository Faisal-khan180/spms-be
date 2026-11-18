/**
 * Comprehensive End-to-End System Test for SPMS
 * Tests all 12 modules, authentication, eligibility engine, and database interactions.
 */
require('dotenv').config();
const http = require('http');
const app = require('./app');

let server;
const PORT = 5001;
const BASE_URL = `http://localhost:${PORT}/api`;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const reqOptions = {
      method: options.method || 'GET',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: options.headers || {}
    };

    if (options.body) {
      reqOptions.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  server = app.listen(PORT, async () => {
    console.log(`Test server running on port ${PORT}...`);
    try {
      // 1. Health check
      console.log('Testing Health Check...');
      const health = await request('/health');
      if (health.status !== 200 || !health.data.success) throw new Error('Health check failed');
      console.log('  ✓ Health check passed');

      // 2. Admin Login
      console.log('Testing Admin Login...');
      const adminLogin = await request('/auth/login', {
        method: 'POST',
        body: { email: 'admin@spms.edu', password: 'Password@123' }
      });
      if (adminLogin.status !== 200 || !adminLogin.data.data.token) throw new Error('Admin login failed: ' + JSON.stringify(adminLogin.data));
      const adminToken = adminLogin.data.data.token;
      console.log('  ✓ Admin login successful');

      // 3. Admin Dashboard Stats & Analytics
      console.log('Testing Admin Dashboard Stats...');
      const adminStats = await request('/admin/stats', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (adminStats.status !== 200 || !adminStats.data.data.analytics) throw new Error('Admin stats failed');
      console.log('  ✓ Admin dashboard stats & Chart.js data fetched');

      // 4. Admin Student Directory
      console.log('Testing Admin Student Directory...');
      const studentDir = await request('/students', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (studentDir.status !== 200 || !Array.isArray(studentDir.data.data.students)) throw new Error('Student directory failed');
      console.log(`  ✓ Found ${studentDir.data.data.students.length} students in directory`);

      // 5. Student Registration & Validation
      console.log('Testing Student Registration (Mandatory Validation & Unique Roll)...');
      const testEmail = `test.student.${Date.now()}@student.spms.edu`;
      const testRoll = `CS_${Date.now().toString().slice(-6)}`;

      // 5a. Missing mandatory field should fail with 400
      const missingFieldReg = await request('/auth/register', {
        method: 'POST',
        body: {
          name: 'Incomplete Candidate',
          email: `incomplete.${Date.now()}@student.spms.edu`,
          password: 'Password@123',
          role: 'student',
          roll_number: `INC_${Date.now().toString().slice(-5)}`
          // Missing branch, phone, cgpa, batch_year, etc.
        }
      });
      if (missingFieldReg.status !== 400) throw new Error('Expected 400 for missing mandatory fields');
      console.log('  ✓ Mandatory field validation passed (400 on incomplete form)');

      // 5b. Valid registration with all fields
      const studentReg = await request('/auth/register', {
        method: 'POST',
        body: {
          name: 'Test Candidate',
          email: testEmail,
          password: 'Password@123',
          phone: '9876543210',
          role: 'student',
          roll_number: testRoll,
          branch: 'Computer Science',
          course: 'B.Tech',
          degree: 'B.Tech',
          batch_year: 2025,
          passing_year: 2025,
          cgpa: 8.85,
          backlog_count: 0,
          tenth_percentage: 91.5,
          twelfth_percentage: 89.0
        }
      });
      if (studentReg.status !== 201) throw new Error('Student register failed: ' + JSON.stringify(studentReg.data));
      if (studentReg.data.data.user.verification_status !== 'pending') throw new Error('Newly registered student must have status pending');
      const studentToken = studentReg.data.data.token;
      console.log('  ✓ Student registered with all academic fields (Status: Pending Verification)');

      // 5c. Duplicate Roll Number should fail with 409 Conflict
      const dupRollReg = await request('/auth/register', {
        method: 'POST',
        body: {
          name: 'Duplicate Roll Candidate',
          email: `dup.${Date.now()}@student.spms.edu`,
          password: 'Password@123',
          phone: '9876543211',
          role: 'student',
          roll_number: testRoll, // Same roll number
          branch: 'Information Technology',
          course: 'B.Tech',
          degree: 'B.Tech',
          batch_year: 2025,
          passing_year: 2025,
          cgpa: 7.5,
          backlog_count: 0,
          tenth_percentage: 85.0,
          twelfth_percentage: 82.0
        }
      });
      if (dupRollReg.status !== 409) throw new Error('Expected 409 for duplicate roll number');
      console.log('  ✓ Duplicate roll number prevented with 409 Conflict');

      // 5d. Unapproved student blocked from applying to drive
      console.log('Testing Unapproved Student Blocked from Drive Application...');
      const unapprovedApply = await request('/applications', {
        method: 'POST',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { drive_id: 6 }
      });
      if (unapprovedApply.status !== 403) throw new Error('Expected 403 for unapproved student applying to drive');
      console.log('  ✓ Unapproved student correctly blocked from applying to drives (403 Forbidden)');

      // 5e. Admin reviews and approves student
      console.log('Testing Admin Student Verification (Approve / Reject)...');
      const pendingStudentsRes = await request('/students?verification_status=pending', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const pendingList = pendingStudentsRes.data.data.students;
      const registeredStudent = pendingList.find(s => s.roll_number === testRoll);
      if (!registeredStudent) throw new Error('Newly registered student not found in pending list');

      // Admin approves student
      const approveRes = await request(`/students/${registeredStudent.id}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (approveRes.status !== 200 || approveRes.data.data.student.verification_status !== 'approved') {
        throw new Error('Admin approve student failed');
      }
      console.log('  ✓ Admin approved student registration successfully');

      // Admin rejects student test
      const rejectRes = await request(`/students/${registeredStudent.id}/reject`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { reason: 'Academic verification test rejection' }
      });
      if (rejectRes.status !== 200 || rejectRes.data.data.student.verification_status !== 'rejected') {
        throw new Error('Admin reject student failed');
      }
      console.log('  ✓ Admin rejected student registration with reason');

      // Re-approve for profile test
      await request(`/students/${registeredStudent.id}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      // 6. Student Add Skill & Project
      console.log('Testing Student Add Skill...');
      const addSkill = await request('/students/me/skills', {
        method: 'POST',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: { skill_name: 'React' }
      });
      if (addSkill.status !== 201) throw new Error('Add skill failed');
      console.log('  ✓ Student skill added');

      // 7. Student Update Profile with Academic Cutoffs
      console.log('Testing Student Profile Update...');
      const updateProf = await request('/students/me', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${studentToken}` },
        body: {
          tenth_percentage: 92.0,
          twelfth_percentage: 90.5,
          course: 'B.Tech CS'
        }
      });
      if (updateProf.status !== 200) throw new Error('Update profile failed');
      console.log('  ✓ Student profile updated successfully');

      // 8. Notifications Read-All
      console.log('Testing Notification Read-All...');
      const readAll = await request('/notifications/read-all', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${studentToken}` }
      });
      if (readAll.status !== 200) throw new Error('Read all notifications failed');
      console.log('  ✓ Mark all notifications read passed');

      // 9. Company Login & Drive Rounds
      console.log('Testing Company Login...');
      const compLogin = await request('/auth/login', {
        method: 'POST',
        body: { email: 'hr@technova.example.com', password: 'Password@123' }
      });
      if (compLogin.status !== 200) throw new Error('Company login failed');
      const compToken = compLogin.data.data.token;
      console.log('  ✓ Company login successful');

      // 10. Company Drive List & Interview Results Query
      console.log('Testing Company Drives & Interview Results Endpoint...');
      const myDrives = await request('/drives/my', {
        headers: { Authorization: `Bearer ${compToken}` }
      });
      if (myDrives.status !== 200 || !myDrives.data.data.drives.length) throw new Error('Company drives query failed');
      const firstDriveId = myDrives.data.data.drives[0].id;

      const driveResults = await request(`/interviews/drives/${firstDriveId}/results`, {
        headers: { Authorization: `Bearer ${compToken}` }
      });
      if (driveResults.status !== 200) throw new Error('Drive results query failed');
      console.log('  ✓ Drive results query endpoint passed');

      // 11. Admin Company Approval & Drive Status Endpoints
      console.log('Testing Admin Company Approval (/api/companies/:id/approval)...');
      const compApproveRes = await request('/companies/2/approval', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { is_approved: true }
      });
      if (compApproveRes.status !== 200) throw new Error('Company approval PATCH failed: ' + JSON.stringify(compApproveRes.data));
      console.log('  ✓ Company approval route passed');

      console.log('Testing Admin Drive Status (/api/drives/:id/status)...');
      const driveStatusRes = await request(`/drives/${firstDriveId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { status: 'approved' }
      });
      if (driveStatusRes.status !== 200) throw new Error('Drive status PATCH failed: ' + JSON.stringify(driveStatusRes.data));
      console.log('  ✓ Drive status route passed');

      console.log('\n=========================================');
      console.log('🎉 ALL SYSTEM TESTS PASSED SUCCESSFULLY!');
      console.log('=========================================\n');
      process.exit(0);
    } catch (err) {
      console.error('\n❌ TEST FAILED:', err.message);
      process.exit(1);
    } finally {
      if (server) server.close();
    }
  });
}

runTests();
