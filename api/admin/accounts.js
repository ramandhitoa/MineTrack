import { getFirebaseAdmin } from '../../functions/src/firebaseAdmin.js';
import { createAccountHandler } from '../_lib/accountCreation.js';

export default createAccountHandler({ getAdmin: getFirebaseAdmin });