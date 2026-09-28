import { getFirebaseAdmin } from '../_lib/firebaseAdmin.js';
import { createAccountHandler } from '../_lib/accountCreation.js';

export default createAccountHandler({ getAdmin: getFirebaseAdmin });