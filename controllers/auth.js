const crypto = require('crypto');

const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const sendgridTransport = require('nodemailer-sendgrid-transport');
const { validationResult } = require('express-validator');

const User = require('../models/user');


const transporter = nodemailer.createTransport(sendgridTransport({
    auth: {
        api_key: 'API_KEY'
    }
}));

// Getting Login page
exports.getLogin = (req, res, next) => { 
    let message = req.flash('error');
    if(message.length > 0) {
        message = message[0];
    } else {
        message = null;
    }
    res.render('auth/login', {
        path : '/login',
        pageTitle: 'Login',
        errorMessage: message,
        oldInput: {
            email: '',
            password: ''
        },
        validationErrors: []
    });     
};

// Getting Signup page
exports.getSignup = (req, res, next) => {
    let message = req.flash('error');
    if(message.length > 0) {
        message = message[0];
    } else {
        message = null;
    }
    res.render('auth/signup', {
        path: '/signup',
        pageTitle: 'Signup',
        errorMessage: message,
        oldInput: { 
            email: '',
            password: '',
            confirmPassword: ''
        },
        validationErrors: []
    });
};

// Post Login data
exports.postLogin = (req, res, next) => { 
    const email = req.body.email;
    const password = req.body.password;

    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        console.log(errors.array());
        return res.status(422).render('auth/login', {
            path: '/login',
            pageTitle: 'Login',
            errorMessage: errors.array()[0].msg,
            oldInput: {
                email: email,
                password: password
            },
            validationErrors: errors.array()
        });
    }

    User.findOne({ email: email })
        .then(user => {
            if (!user) {
                return res.status(422).render('auth/login', {
                    path: '/login',
                    pageTitle: 'Login',
                    errorMessage: 'Email does not exist',
                    oldInput: {
                        email: email,
                        password: password
                    },
                    validationErrors: []
                });
            }
        bcrypt
            .compare(password, user.password)
            .then(doMatch => {
                if(doMatch) {
                    req.session.isLoggedIn = true;
                    req.session.user = user;
                    return req.session.save(err => {
                        console.log(err);
                        res.redirect('/');
                    });
                }
                return res.status(422).render('auth/login', {
                    path: '/login',
                    pageTitle: 'Login',
                    errorMessage: 'Email does not exist',
                    oldInput: {
                        email: email,
                        password: password
                    },
                    validationErrors: []
                });
            })
            .catch(err => {
                console.log(err);
                res.redirect('/login');
            }); 
        })
        .catch(err => console.log(err));    
};

// Post Signup data
exports.postSignup = (req, res, next) => {
    const email = req.body.email;
    const password = req.body.password;

    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        console.log(errors.array());
        return res.status(422).render('auth/signup', {
            path: '/signup',
            pageTitle: 'Signup',
            errorMessage: errors.array()[0].msg,
            oldInput: { 
                email: email, 
                password: password, 
                confirmPassword: req.body.confirmPassword 
            },
            validationErrors: errors.array()
        });
    }
  
    bcrypt
        .hash(password, 12)
        .then(hashedPassword => {
            const user = new User({
                email: email,
                password: hashedPassword,
                cart: { items: [] }
            });
            return user.save();
        })
        .then(result => {
            res.redirect('/login');
            // return transporter.sendMail({
            //     to: email,
            //     from: 'urvipatel922@gmail.com',
            //     subject: 'Signup successful',
            //     html: '<h1>If you are getting this email please reply to me on whatsapp :)</h1>'
            // });     
        })
        .catch(err => {
            console.log(err);
        })      
};

// Post Logout data
exports.postLogout = (req, res, next) => { 
    req.session.destroy((err) => {
        console.log(err);
        res.redirect('/');
    }); 
};

// Get resest password page
exports.getReset = (req, res, next) => {
    let message = req.flash('error');
    if(message.length > 0) {
        message = message[0];
    } else {
        message = null;
    }
    res.render('auth/reset', {
        path: '/reset',
        pageTitle: 'Reset Password',
        errorMessage: message
    });
};

//Post reset password
exports.postReset = (req, res, next) => {
    crypto.randomBytes(32, (err, buffer) => {
        if(err) {
            console.log(err);
            return res.redirect('/reset');
        }
        const token = buffer.toString('hex');
        User.findOne({email: req.body.email})
            .then(user =>{
                if(!user) {
                    req.flash('error', 'No account with that email found!');
                    return res.redirect('/reset');
                }
                user.resetToken = token;
                user.resetTokenExpiration = Date.now() + 3600000;
                return user.save();
            })
            .then(result => {
                res.redirect('/');
                transporter.sendMail({
                    to: req.body.email,
                    from: 'urvipatel922@gmail.com',
                    subject: 'Reset Password',
                    html: `
                    <p>If you get this email reply to me on whatsapp :)</p>
                    <p>You requested a password reset.</p>
                    <p>Click this <a href="http://localhost:3000/reset/${token}">link</a> to set a new password.</p>
                    `
                });
            })
            .catch(err => {
                console.log(err);
            });
    });

};

// Get new password page
exports.getNewPassword = (req, res, next) => {
    const token = req.params.token;
    User.findOne({ resetToken: token, resetTokenExpiration: { $gt: Date.now() } })
        .then(user => {
            let message = req.flash('error');
            if(message.length > 0) {
                message = message[0];
            } else {
                message = null;
            }
            res.render('auth/new-password', {
                path: '/new-password',
                pageTitle: 'New Password',
                errorMessage: message,
                userId: user._id.toString(),
                passwordToken: token
            });
        })
        .catch(err => {
            console.log(err);
        });    
};

// Post new password to database
exports.postNewPassword = (req, res, next) => {
    const newPassword = req.body.password;
    const userId = req.body.userId;
    const passwordToken = req.body.passwordToken;
    let resetUser;

    User.findOne({
        resetToken: passwordToken,
        resetTokenExpiration: { $gt: Date.now() },
        _id: userId 
    })
    .then(user => {
        resetUser = user;
        return bcrypt.hash(newPassword, 12);
    })
    .then(hashedPassword => {
        resetUser.password = hashedPassword;
        resetUser.resetToken = undefined;
        resetUser.resetTokenExpiration= undefined;
        return resetUser.save();
    })
    .then(result => {
        res.redirect('/login');
    })
    .catch(err => {
        console.log(err);
    }) 
};


