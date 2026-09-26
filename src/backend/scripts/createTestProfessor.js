const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Import the Professor model
const Professor = require('../models/Professor');

async function createTestProfessor() {
    try {
        // Connect to MongoDB
        await mongoose.connect(require('./mongoUri'));
        console.log('✅ Connected to MongoDB');

        // Check if test professor already exists
        const existingProfessor = await Professor.findOne({ email: 'test.professor@kennesaw.edu' });
        if (existingProfessor) {
            console.log('👨‍🏫 Test professor already exists:');
            console.log(`  Name: ${existingProfessor.firstName} ${existingProfessor.lastName}`);
            console.log(`  Email: ${existingProfessor.email}`);
            console.log(`  ID: ${existingProfessor._id}`);
            return existingProfessor;
        }

        // Create test professor with hashed password
        const hashedPassword = await bcrypt.hash('testpassword123', 10);
        
        const testProfessor = new Professor({
            firstName: 'Dr. Test',
            lastName: 'Professor',
            email: 'test.professor@kennesaw.edu',
            password: hashedPassword,
            department: 'Computer Science',
            title: 'Professor'
        });

        await testProfessor.save();
        
        console.log('🎉 Test professor created successfully!');
        console.log(`  Name: ${testProfessor.firstName} ${testProfessor.lastName}`);
        console.log(`  Email: ${testProfessor.email}`);
        console.log(`  Department: ${testProfessor.department}`);
        console.log(`  Password: testpassword123`);
        console.log(`  ID: ${testProfessor._id}`);
        
        return testProfessor;

    } catch (error) {
        console.error('❌ Error creating test professor:', error);
    } finally {
        await mongoose.connection.close();
        console.log('📡 Database connection closed');
    }
}

// Run the script
createTestProfessor();