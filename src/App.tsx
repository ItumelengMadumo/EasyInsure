import { Authenticator } from '@aws-amplify/ui-react';
import { AuthHeader } from './components/AuthHeader';
import { Workspace } from './components/Workspace';

export default function App() {
  return (
    <Authenticator
      loginMechanisms={['email']}
      signUpAttributes={['preferred_username']}
      components={{ Header: AuthHeader }}
    >
      {({ signOut }) => <Workspace signOut={signOut} />}
    </Authenticator>
  );
}
