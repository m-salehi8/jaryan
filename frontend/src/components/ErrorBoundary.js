import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 w-full h-full flex flex-col items-center justify-center">
          <Alert variant="destructive" className="max-w-md w-full bg-red-50 text-right" dir="rtl">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="font-semibold mb-2">خطا در نمایش اطلاعات</AlertTitle>
            <AlertDescription>
              لطفا صفحه را رفرش کنید یا با پشتیبانی تماس بگیرید.
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
